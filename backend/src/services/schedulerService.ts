import cron from 'node-cron';
import { configService } from './configService.js';
import logger from '../utils/logger.js';
import { radarrService } from './radarrService.js';
import { sonarrService } from './sonarrService.js';
import { statsService } from './statsService.js';
import { getConfiguredInstances } from '../utils/starrUtils.js';
import { processApplication } from '../routes/search.js';

class SchedulerService {
  private task: cron.ScheduledTask | null = null;
  private isRunning = false;

  async initialize(): Promise<void> {
    const config = configService.getConfig();
    if (config.scheduler?.enabled && config.scheduler?.schedule) {
      this.start(config.scheduler.schedule);
      logger.info('✅ Scheduler initialized', { schedule: config.scheduler.schedule });
    } else {
      logger.info('ℹ️  Scheduler disabled');
    }
  }

  start(schedule: string): void {
    this.stop(); // Stop existing task if any

    if (!cron.validate(schedule)) {
      logger.error('❌ Invalid cron schedule', { schedule });
      return;
    }

    this.task = cron.schedule(schedule, async () => {
      if (this.isRunning) {
        logger.warn('⏸️  Previous search still running, skipping scheduled run');
        return;
      }

      this.isRunning = true;
      logger.info('⏰ Scheduled search triggered', { schedule });

      try {
        const config = configService.getConfig();
        const results: Record<string, any> = {};

        // Process Radarr
        const radarrInstances = getConfiguredInstances(config.applications.radarr);
        
        for (const radarrConfig of radarrInstances) {
          const instanceName = (radarrConfig as any).name || 'Radarr';
          const instanceId = (radarrConfig as any).id || 'radarr-1';
          const result = await processApplication({
            name: instanceName,
            config: radarrConfig,
            getMedia: radarrService.getMovies.bind(radarrService),
            filterMedia: radarrService.filterMovies.bind(radarrService),
            searchMedia: radarrService.searchMovies.bind(radarrService),
            searchMediaOneByOne: false,
            getTagId: radarrService.getTagId.bind(radarrService),
            addTag: radarrService.addTagToMovies.bind(radarrService),
            removeTag: radarrService.removeTagFromMovies.bind(radarrService),
            getMediaId: (m) => m.id,
            getMediaTitle: (m) => m.title
          });
          const resultKey = radarrInstances.length > 1 ? `${instanceId}` : 'radarr';
          results[resultKey] = {
            ...result,
            movies: result.items,
            instanceName
          };
        }

        // Process Sonarr
        const sonarrInstances = getConfiguredInstances(config.applications.sonarr);
        
        for (const sonarrConfig of sonarrInstances) {
          const instanceName = (sonarrConfig as any).name || 'Sonarr';
          const instanceId = (sonarrConfig as any).id || 'sonarr-1';
          const result = await processApplication({
            name: instanceName,
            config: sonarrConfig,
            getMedia: sonarrService.getSeries.bind(sonarrService),
            filterMedia: sonarrService.filterSeries.bind(sonarrService),
            searchMedia: async (cfg, seriesIds) => {
              if (seriesIds.length > 0) {
                await sonarrService.searchSeries(cfg, seriesIds[0]);
              }
            },
            searchMediaOneByOne: true,
            getTagId: sonarrService.getTagId.bind(sonarrService),
            addTag: sonarrService.addTagToSeries.bind(sonarrService),
            removeTag: sonarrService.removeTagFromSeries.bind(sonarrService),
            getMediaId: (s) => s.id,
            getMediaTitle: (s) => s.title
          });
          const resultKey = sonarrInstances.length > 1 ? `${instanceId}` : 'sonarr';
          results[resultKey] = {
            ...result,
            series: result.items,
            instanceName
          };
        }

        // Save stats for successful searches
        for (const [app, result] of Object.entries(results)) {
          if (result.success && result.searched && result.searched > 0) {
            const items = result.movies || result.series || result.items || [];
            const instanceName = result.instanceName;
            const instanceId = app.includes('-') && app !== 'radarr' && app !== 'sonarr' ? app.split('-').slice(1).join('-') : undefined;
            await statsService.addUpgrade(
              instanceName || app, 
              result.searched, 
              items,
              instanceId || instanceName
            );
          }
        }

        logger.info('✅ Scheduled search completed', { 
          results: Object.keys(results).map(app => ({
            app,
            success: results[app].success,
            count: results[app].searched || 0
          }))
        });
      } catch (error: any) {
        logger.error('❌ Scheduled search failed', { 
          error: error.message,
          stack: error.stack
        });
      } finally {
        this.isRunning = false;
      }
    }, {
      scheduled: true,
      timezone: 'UTC'
    });

    logger.info('🕐 Scheduler started', { schedule });
  }

  stop(): void {
    if (this.task) {
      this.task.stop();
      this.task = null;
      logger.info('⏹️  Scheduler stopped');
    }
  }

  restart(): void {
    const config = configService.getConfig();
    if (config.scheduler?.enabled && config.scheduler?.schedule) {
      this.start(config.scheduler.schedule);
    } else {
      this.stop();
    }
  }

  getStatus(): { running: boolean; schedule: string | null } {
    return {
      running: this.task !== null,
      schedule: configService.getConfig().scheduler?.schedule || null
    };
  }
}

export const schedulerService = new SchedulerService();

