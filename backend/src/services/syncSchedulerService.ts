import { createRequire } from 'module';
import logger, { startOperation } from '../utils/logger.js';
import { configService } from './configService.js';
import { statsService } from './statsService.js';
import { syncInstanceMedia } from '../utils/mediaSync.js';
import { APP_TYPES, AppType } from '../utils/starrUtils.js';
import { getErrorMessage, getErrorDetails } from '../utils/errorUtils.js';

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
      const { message, stack, name } = getErrorDetails(error);
      
      logger.error('❌ Invalid cron expression for sync schedule', { 
        schedule,
        error: message,
        errorName: name,
        stack
      });
      throw new Error(`Invalid sync schedule cron expression "${schedule}": ${message}`);
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

  /**
   * Sync a single instance with all its media and profiles
   * This is the core sync logic used by both syncAllInstances and syncInstance
   */
  private async syncSingleInstance(
    appType: AppType,
    instance: { id: string; name?: string; [key: string]: any }
  ): Promise<number> {
    const endOp = startOperation('SyncScheduler.syncSingleInstance', { appType, instanceId: instance.id, instanceName: instance.name });
    try {
      logger.info(`🔄 Syncing ${appType} instance: ${instance.name || instance.id}`);

      // Sync media using centralized utility
      const syncResult = await syncInstanceMedia({
        instanceId: instance.id,
        appType: appType as AppType,
        instance
      });
      
      const mediaWithTagNames = syncResult.mediaWithTags;
      
      // Count unique tags found
      const allTagNames = new Set<string>();
      mediaWithTagNames.forEach(item => {
        if (Array.isArray(item.tags)) {
          item.tags.forEach((tag: string) => allTagNames.add(tag));
        }
      });
      logger.info(`✅ Tag conversion completed`, { 
        mediaItems: mediaWithTagNames.length,
        uniqueTags: allTagNames.size,
        tags: Array.from(allTagNames)
      });

      // Sync to database
      await statsService.syncMediaToDatabase(instance.id, mediaWithTagNames);
      logger.info(`✅ Synced ${allMedia.length} items for ${appType} instance: ${instance.name || instance.id}`);

      endOp({ syncedCount: allMedia.length }, true);
      return allMedia.length;
    } catch (error: unknown) {
      const errMsg = getErrorMessage(error);
      logger.error(`❌ syncSingleInstance failed for ${appType} ${instance.id}`, { error: errMsg });
      endOp({ error: errMsg }, false);
      throw error;
    }
  }

  async syncAllInstances(): Promise<void> {
    if (this.isRunning) {
      logger.warn('⚠️  Sync already in progress, skipping');
      return;
    }

    const endOp = startOperation('SyncScheduler.syncAllInstances', {});
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
            const synced = await this.syncSingleInstance(appType as AppType, instance);
            totalSynced += synced;
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
      endOp({ totalSynced }, true);
    } catch (error: unknown) {
      logger.error('❌ Error during sync', {
        error: getErrorMessage(error)
      });
      endOp({ error: getErrorMessage(error) }, false);
    } finally {
      this.isRunning = false;
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
    logger.debug('⏱️  Calculating next sync run', { currentSchedule: this.currentSchedule });
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
