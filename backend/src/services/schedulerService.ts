import cron from 'node-cron';
import { configService } from './configService.js';
import logger from '../utils/logger.js';
import { radarrService } from './radarrService.js';
import { sonarrService } from './sonarrService.js';
import { statsService } from './statsService.js';
import { getConfiguredInstances } from '../utils/starrUtils.js';
import { 
  processApplication, 
  createRadarrProcessor, 
  createSonarrProcessor,
  getResultKey,
  getInstanceInfo,
  saveStatsForResults
} from '../routes/search.js';

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

        // Process Radarr (use scheduler's unattended setting)
        const radarrInstances = getConfiguredInstances(config.applications.radarr);
        const unattended = config.scheduler?.unattended || false;
        for (const radarrConfig of radarrInstances) {
          const { instanceName, instanceId } = getInstanceInfo(radarrConfig, 'radarr');
          const unattendedConfig = { ...radarrConfig, unattended };
          const processor = createRadarrProcessor(instanceName, unattendedConfig);
          const result = await processApplication(processor);
          const resultKey = getResultKey(instanceId, 'radarr', radarrInstances.length);
          results[resultKey] = {
            ...result,
            movies: result.items,
            instanceName
          };
        }

        // Process Sonarr (use scheduler's unattended setting)
        const sonarrInstances = getConfiguredInstances(config.applications.sonarr);
        for (const sonarrConfig of sonarrInstances) {
          const { instanceName, instanceId } = getInstanceInfo(sonarrConfig, 'sonarr');
          const unattendedConfig = { ...sonarrConfig, unattended };
          const processor = createSonarrProcessor(instanceName, unattendedConfig);
          const result = await processApplication(processor);
          const resultKey = getResultKey(instanceId, 'sonarr', sonarrInstances.length);
          results[resultKey] = {
            ...result,
            series: result.items,
            instanceName
          };
        }

        // Save stats for successful searches
        await saveStatsForResults(results);

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

