import logger from '../utils/logger.js';
import { configService } from './configService.js';
import { statsService } from './statsService.js';
import { getServiceForApp } from '../utils/serviceRegistry.js';
import { APP_TYPES, AppType } from '../utils/starrUtils.js';
import { getErrorMessage } from '../utils/errorUtils.js';

class SyncSchedulerService {
  private intervalId: NodeJS.Timeout | null = null;
  private isRunning = false;

  start(): void {
    const config = configService.getConfig();

    if (!config.tasks?.syncEnabled) {
      logger.info('⏸️  Sync scheduler disabled');
      return;
    }

    const intervalMs = (config.tasks.syncInterval || 24) * 60 * 60 * 1000; // Convert hours to ms

    logger.info('▶️  Starting sync scheduler', {
      intervalHours: config.tasks.syncInterval,
      intervalMs,
      enabled: config.tasks.syncEnabled
    });

    // Run initial sync
    this.syncAllInstances();

    // Set up interval
    this.intervalId = setInterval(() => {
      this.syncAllInstances();
    }, intervalMs);

    logger.info('✅ Sync scheduler started');
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      logger.info('⏹️  Sync scheduler stopped');
    }
  }

  restart(): void {
    logger.info('🔄 Restarting sync scheduler');
    this.stop();
    this.start();
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
            await statsService.syncQualityProfilesToDatabase(instance.id, profiles);

            // Fetch all media from API
            const allMedia = await service.getMedia(instance);
            logger.debug(`✅ Fetched ${allMedia.length} items from ${appType} instance ${instance.id}`);

            // Sync to database
            await statsService.syncMediaToDatabase(instance.id, allMedia);
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
      await statsService.syncQualityProfilesToDatabase(instance.id, profiles);

      // Fetch all media from API
      const allMedia = await service.getMedia(instance);
      logger.debug(`✅ Fetched ${allMedia.length} items from ${appType} instance ${instance.id}`);

      // Sync to database
      await statsService.syncMediaToDatabase(instance.id, allMedia);
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
}

export const syncSchedulerService = new SyncSchedulerService();
