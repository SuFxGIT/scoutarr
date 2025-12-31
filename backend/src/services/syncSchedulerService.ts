import { createRequire } from 'module';
import logger from '../utils/logger.js';
import { configService } from './configService.js';
import { statsService } from './statsService.js';
import { getServiceForApp } from '../utils/serviceRegistry.js';
import { APP_TYPES, AppType } from '../utils/starrUtils.js';
import { getErrorMessage } from '../utils/errorUtils.js';

/**
 * Import CommonJS modules using createRequire
 * - cron-parser: Used for validation and calculating next run times
 * - node-cron: Used for actual task scheduling
 */
const require = createRequire(import.meta.url);
const { CronExpressionParser } = require('cron-parser');
const cron = require('node-cron');

/** Type for node-cron ScheduledTask */
interface ScheduledTask {
  start: () => void;
  stop: () => void;
}

class SyncSchedulerService {
  private task: ScheduledTask | null = null;
  private isRunning = false;
  private currentSchedule: string | null = null;

  start(skipInitialSync = false): void {
    const config = configService.getConfig();

    if (!config.tasks?.syncEnabled) {
      logger.info('⏸️  Sync scheduler disabled');
      return;
    }

    const schedule = config.tasks.syncSchedule;

    // Validate cron expression using cron-parser
    try {
      CronExpressionParser.parse(schedule);
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      const errorStack = error instanceof Error ? error.stack : undefined;
      const errorName = error instanceof Error ? error.name : 'Error';
      
      logger.error('❌ Invalid cron expression for sync schedule', { 
        schedule,
        error: errorMessage,
        errorName,
        stack: errorStack
      });
      throw new Error(`Invalid sync schedule cron expression "${schedule}": ${errorMessage}`);
    }

    logger.info('▶️  Starting sync scheduler', {
      schedule,
      enabled: config.tasks.syncEnabled,
      skipInitialSync
    });

    // Run initial sync unless explicitly skipped
    if (!skipInitialSync) {
      this.syncAllInstances();
    }

    // Set up cron task
    this.task = cron.schedule(schedule, () => {
      this.syncAllInstances();
    });

    this.currentSchedule = schedule;
    logger.info('✅ Sync scheduler started');
  }

  stop(): void {
    if (this.task) {
      this.task.stop();
      this.task = null;
      this.currentSchedule = null;
      logger.info('⏹️  Sync scheduler stopped');
    }
  }

  restart(skipInitialSync = false): void {
    logger.info('🔄 Restarting sync scheduler', { skipInitialSync });
    this.stop();
    this.start(skipInitialSync);
  }

  async syncAllInstances(): Promise<void> {
    if (this.isRunning) {
      logger.warn('⚠️  Sync already in progress, skipping');
      return;
    }

    this.isRunning = true;
    logger.info('🔄 Starting sync of all instances');

    try {
      const config = configService.getConfig();
      let totalSynced = 0;

      for (const appType of APP_TYPES) {
        const instances = config.applications[appType];
        if (!instances || !Array.isArray(instances)) continue;

        for (const instance of instances) {
          try {
            logger.info(`🔄 Syncing ${appType} instance: ${instance.name || instance.id}`);

            const service = getServiceForApp(appType as AppType);

            // Upsert instance record
            await statsService.upsertInstance(instance.id, appType, instance.name);

            // Fetch quality profiles from API
            logger.debug(`📡 [${appType.charAt(0).toUpperCase() + appType.slice(1)} API] Fetching quality profiles for sync`);
            const profiles = await service.getQualityProfiles(instance);

            // Sync quality profiles to database
            logger.debug('💾 [Scoutarr DB] Syncing quality profiles to database');
            await statsService.syncQualityProfiles(instance.id, profiles);
            logger.debug('✅ [Scoutarr DB] Quality profiles synced');

            // Fetch all media from API
            const allMedia = await service.getMedia(instance);
            logger.debug(`✅ Fetched ${allMedia.length} items from ${appType} instance ${instance.id}`);

            // Convert tag IDs to names before syncing
            logger.debug('🏷️  Converting tag IDs to names');
            const mediaWithTagNames = await Promise.all(
              allMedia.map(async (item) => {
                const tagNames = await service.convertTagIdsToNames(instance, item.tags);
                return { ...item, tags: tagNames };
              })
            );
            logger.debug('✅ Tag IDs converted to names');

            // Sync to database
            await statsService.syncMediaToDatabase(instance.id, mediaWithTagNames);
            logger.info(`✅ Synced ${allMedia.length} items for ${appType} instance: ${instance.name || instance.id}`);

            totalSynced += allMedia.length;
          } catch (error: unknown) {
            logger.error(`❌ Error syncing ${appType} instance ${instance.id}`, {
              error: getErrorMessage(error),
              appType,
              instanceId: instance.id
            });
          }
        }
      }

      logger.info(`✅ Sync completed. Total items synced: ${totalSynced}`);
    } catch (error: unknown) {
      logger.error('❌ Error during sync', {
        error: getErrorMessage(error)
      });
    } finally {
      this.isRunning = false;
    }
  }

  async syncInstance(appType: AppType, instanceId: string): Promise<void> {
    try {
      logger.info(`🔄 Manually syncing ${appType} instance: ${instanceId}`);

      const config = configService.getConfig();
      const instances = config.applications[appType];
      const instance = instances.find(inst => inst.id === instanceId);

      if (!instance) {
        throw new Error(`Instance ${instanceId} not found for ${appType}`);
      }

      const service = getServiceForApp(appType);

      // Upsert instance record
      await statsService.upsertInstance(instance.id, appType, instance.name);

      // Fetch quality profiles from API
      logger.debug(`📡 [${appType.charAt(0).toUpperCase() + appType.slice(1)} API] Fetching quality profiles for sync`);
      const profiles = await service.getQualityProfiles(instance);

      // Sync quality profiles to database
      logger.debug('💾 [Scoutarr DB] Syncing quality profiles to database');
      await statsService.syncQualityProfiles(instance.id, profiles);
      logger.debug('✅ [Scoutarr DB] Quality profiles synced');

      // Fetch all media from API
      const allMedia = await service.getMedia(instance);
      logger.debug(`✅ Fetched ${allMedia.length} items from ${appType} instance ${instance.id}`);

      // Convert tag IDs to names before syncing
      logger.debug('🏷️  Converting tag IDs to names');
      const mediaWithTagNames = await Promise.all(
        allMedia.map(async (item) => {
          const tagNames = await service.convertTagIdsToNames(instance, item.tags);
          return { ...item, tags: tagNames };
        })
      );
      logger.debug('✅ Tag IDs converted to names');

      // Sync to database
      await statsService.syncMediaToDatabase(instance.id, mediaWithTagNames);
      logger.info(`✅ Synced ${allMedia.length} items for ${appType} instance: ${instance.name || instance.id}`);
    } catch (error: unknown) {
      logger.error(`❌ Error syncing ${appType} instance ${instanceId}`, {
        error: getErrorMessage(error)
      });
      throw error;
    }
  }

  isSyncRunning(): boolean {
    return this.isRunning;
  }

  getCurrentSchedule(): string | null {
    return this.currentSchedule;
  }

  getNextRunTime(): Date | null {
    if (!this.currentSchedule) return null;
    try {
      const interval = CronExpressionParser.parse(this.currentSchedule);
      return interval.next().toDate();
    } catch (error: unknown) {
      logger.debug('Could not parse sync cron for next run time', {
        schedule: this.currentSchedule,
        error: getErrorMessage(error)
      });
      return null;
    }
  }
}

export const syncSchedulerService = new SyncSchedulerService();
