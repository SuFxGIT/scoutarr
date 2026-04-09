import express from 'express';
import { configService } from '../services/configService.js';
import { statsService } from '../services/statsService.js';
import { schedulerService } from '../services/schedulerService.js';
import { testStarrConnection, getMediaTypeKey, APP_TYPES, AppType } from '../utils/starrUtils.js';
import { getServiceForApp } from '../utils/serviceRegistry.js';
import { handleRouteError, getErrorMessage } from '../utils/errorUtils.js';
import { syncInstanceMedia } from '../utils/mediaSync.js';
import logger from '../utils/logger.js';
import { Config, StarrInstanceConfig } from '@scoutarr/shared';

export const configRouter = express.Router();

// Helper to get first valid instance config from saved config
function getFirstValidInstance(app: AppType): { url: string; apiKey: string } | null {
  const config = configService.getConfig();
  const savedConfig = config.applications[app] as StarrInstanceConfig[] | undefined;
  
  if (!Array.isArray(savedConfig)) return null;
  
  const instance = savedConfig.find(
    (inst: StarrInstanceConfig) => inst?.enabled !== false && inst.url && inst.apiKey
  );
  
  return instance ? { url: instance.url, apiKey: instance.apiKey } : null;
}

// Get config
configRouter.get('/', async (req, res) => {
  logger.debug('📋 Config requested');
  try {
    const config = configService.getConfig();
    res.json(config);
  } catch (error: unknown) {
    handleRouteError(res, error, 'Failed to load config');
  }
});

// Reset app (clears config and stats)
configRouter.post('/reset-app', async (_req, res) => {
  logger.info('🔄 App reset requested - clearing all data');
  try {
    // Reset config to default
    const config = await configService.resetToDefault();
    
    // Clear stats database
    await statsService.resetStats();
    
    logger.info('✅ App reset completed - all data cleared');
    res.json({ success: true, config });
  } catch (error: unknown) {
    handleRouteError(res, error, 'Failed to reset app');
  }
});

// Update config
configRouter.put('/', async (req, res) => {
  logger.info('💾 Config update requested');
  try {
    await configService.saveConfig(req.body);
    logger.info('✅ Config update completed');
    res.json({ success: true });
  } catch (error: unknown) {
    handleRouteError(res, error, 'Failed to save config');
  }
});

// Test connection for an application
configRouter.post('/test/:app', async (req, res) => {
  const { app } = req.params;
  const { instanceId } = req.body;
  logger.info(`🔌 Testing connection for ${app}`);
  try {
    // Use config from request body if provided, otherwise fall back to saved config
    const appConfig = (req.body?.url && req.body?.apiKey)
      ? { url: req.body.url, apiKey: req.body.apiKey }
      : getFirstValidInstance(app as AppType);

    if (!appConfig) {
      logger.warn(`⚠️  ${app} is not configured`);
      return res.status(400).json({ error: 'Application URL and API Key are required' });
    }

    // Test connection
    const testResult = await testStarrConnection(appConfig.url, appConfig.apiKey, app);

    const status = 200;
    const response = testResult.success
      ? { success: true, appName: testResult.appName, version: testResult.version }
      : { error: 'Connection test failed', message: testResult.error || 'Unable to connect' };

    logger[testResult.success ? 'info' : 'error'](
      `${testResult.success ? '✅' : '❌'} Connection test for ${app}`,
      { url: appConfig.url, ...testResult }
    );

    // If test successful and instanceId provided, sync quality profiles to database
    if (testResult.success && instanceId) {
      try {
        // Ensure the instance row exists (FK constraint on quality_profiles)
        await statsService.upsertInstance(instanceId, app, testResult.appName);

        logger.debug(`📡 [${app}] Fetching quality profiles for sync`);
        const service = getServiceForApp(app as AppType);
        const profiles = await service.getQualityProfiles(appConfig as StarrInstanceConfig);

        logger.debug(`💾 [${app}] Syncing ${profiles.length} quality profiles to database`);
        await statsService.syncQualityProfiles(instanceId, profiles);
        logger.info(`✅ [${app}] Quality profiles synced to database`, { instanceId, count: profiles.length });
      } catch (profileError: unknown) {
        // Log error but don't fail the test - connection was successful
        logger.warn(`⚠️  Failed to sync quality profiles for ${app}`, {
          instanceId,
          error: getErrorMessage(profileError)
        });
      }
    }

    res.status(status).json(response);
  } catch (error: unknown) {
    handleRouteError(res, error, 'Connection test failed');
  }
});

// Get quality profiles for an application instance
configRouter.get('/quality-profiles/:app/:instanceId', async (req, res) => {
  const { app, instanceId } = req.params;
  logger.debug(`📋 Fetching quality profiles from database for ${app} instance ${instanceId}`);
  try {
    // Fetch quality profiles from database
    const dbProfiles = await statsService.getQualityProfilesFromDatabase(instanceId);

    // Transform database format to API format
    const profiles = dbProfiles.map(p => ({
      id: p.quality_profile_id,
      name: p.quality_profile_name
    }));

    logger.debug(`✅ Retrieved ${profiles.length} quality profiles from database`, { instanceId });
    res.json(profiles);
  } catch (error: unknown) {
    handleRouteError(res, error, 'Failed to fetch quality profiles');
  }
});

// Helper to find instance config
function findInstanceConfig(config: Config, app: string, instanceId: string): StarrInstanceConfig | null {
  const appConfig = config.applications[app as AppType];
  if (!appConfig) return null;
  
  const instances = Array.isArray(appConfig) ? appConfig : [];
  return instances.find((inst: StarrInstanceConfig) => inst.id === instanceId) || null;
}

// Clear tags from all media in an instance
configRouter.post('/clear-tags/:app/:instanceId', async (req, res) => {
  const { app, instanceId } = req.params;
  logger.info(`🧹 Clearing tags for ${app} instance ${instanceId}`);
  try {
    const config = configService.getConfig();
    logger.debug(`📋 Looking up instance config`, { app, instanceId });
    const instanceConfig = findInstanceConfig(config, app, instanceId);

    if (!instanceConfig || !instanceConfig.url || !instanceConfig.apiKey) {
      logger.warn(`⚠️  Instance not found or not configured`, { app, instanceId });
      return res.status(400).json({ error: 'Instance not found or not configured' });
    }

    logger.debug(`✅ Instance config found`, {
      instanceName: instanceConfig.name,
      url: instanceConfig.url
    });

    // Get service for app type
    const service = getServiceForApp(app as AppType);
    logger.debug(`🔧 Service retrieved for ${app}`);

    // Get list of Scoutarr-managed tags from instances table
    const instance = await statsService.getInstance(instanceId);
    if (!instance) {
      logger.warn(`⚠️  Instance not found in database`, { instanceId });
      return res.status(404).json({ error: 'Instance not found in database' });
    }

    const scoutarrTags = JSON.parse(instance.scoutarr_tags || '[]') as string[];
    const ignoreTags = JSON.parse(instance.ignore_tags || '[]') as string[];
    const allManagedTags = [...scoutarrTags, ...ignoreTags];

    if (allManagedTags.length === 0) {
      logger.info(`ℹ️  No managed tags found for instance`, { instanceId });
      return res.json({ success: true, message: 'No managed tags to clear' });
    }

    logger.debug(`🏷️  Found managed tags to clear`, { tags: allManagedTags });

    // Fetch all media from API to find items with tags
    logger.debug(`📋 Fetching all media from ${app}`);
    const [allMedia, allTags] = await Promise.all([
      service.getMedia(instanceConfig),
      service.getAllTags(instanceConfig),
    ]);
    logger.debug(`📋 Fetched ${allMedia.length} total media items from ${app}`);

    // Build a single tag lookup map to avoid repeated API calls
    const tagIdToName = new Map(allTags.map(t => [t.id, t.label]));
    const tagNameToId = new Map(allTags.map(t => [t.label, t.id]));

    // Convert tag IDs in media to tag names using the cached map
    const mediaWithTagNames = allMedia.map(item => ({
      ...item,
      tagNames: item.tags.map((id: number) => tagIdToName.get(id) ?? `unknown-tag-${id}`),
    }));

    // Clear each managed tag
    let totalCleared = 0;
    for (const tagName of allManagedTags) {
      const tagId = tagNameToId.get(tagName) ?? null;
      if (tagId !== null) {
        // Find media with this tag (by name)
        const taggedMedia = mediaWithTagNames.filter(m => m.tagNames.includes(tagName));
        if (taggedMedia.length > 0) {
          const taggedMediaIds = [...new Set(taggedMedia.map(media => service.getMediaId(media)))];
          logger.debug(`🏷️  Removing tag "${tagName}" from ${taggedMediaIds.length} items`);
          await service.removeTag(instanceConfig, taggedMediaIds, tagId);
          totalCleared += taggedMediaIds.length;
        }
      }
    }

    // Clear scoutarr_tags list from database
    await statsService.clearScoutarrTagsFromInstance(instanceId);
    logger.debug(`✅ Cleared scoutarr tags from instance database record`);

    // Sync media library so the database reflects the removed tags
    logger.debug(`🔄 Syncing media library after tag clear`, { app, instanceId });
    const syncResult = await syncInstanceMedia({
      instanceId,
      appType: app as AppType,
      instance: instanceConfig
    });
    await statsService.syncMediaToDatabase(instanceId, syncResult.mediaWithTags as Parameters<typeof statsService.syncMediaToDatabase>[1]);
    logger.debug(`✅ Media library synced after tag clear`, { count: syncResult.mediaCount });

    // Get media type name for logging
    const mediaTypeName = getMediaTypeKey(app as AppType);

    logger.info(`✅ Cleared ${allManagedTags.length} tags from ${totalCleared} ${mediaTypeName}`, {
      app,
      instanceId,
      tags: allManagedTags,
      count: totalCleared
    });
    res.json({
      success: true,
      message: `Cleared ${allManagedTags.length} tags from ${totalCleared} ${mediaTypeName}`,
      count: totalCleared,
      tags: allManagedTags
    });
  } catch (error: unknown) {
    handleRouteError(res, error, 'Failed to clear tags');
  }
});

// Clear tags from all media across all configured instances
configRouter.post('/clear-tags/all', async (_req, res) => {
  logger.info('🧹 Clearing tags for all instances');
  try {
    const config = configService.getConfig();
    let totalInstances = 0;
    let totalCleared = 0;
    const errors: string[] = [];

    for (const appType of APP_TYPES) {
      const instances = config.applications[appType as AppType];
      if (!Array.isArray(instances)) continue;

      for (const instance of instances) {
        if (!instance.url || !instance.apiKey) continue;

        try {
          const service = getServiceForApp(appType as AppType);
          const dbInstance = await statsService.getInstance(instance.id);
          if (!dbInstance) continue;

          const scoutarrTags = JSON.parse(dbInstance.scoutarr_tags || '[]') as string[];
          const ignoreTags = JSON.parse(dbInstance.ignore_tags || '[]') as string[];
          const allManagedTags = [...scoutarrTags, ...ignoreTags];

          if (allManagedTags.length === 0) continue;

          const [allMedia, allTags] = await Promise.all([
            service.getMedia(instance),
            service.getAllTags(instance),
          ]);

          const tagIdToName = new Map(allTags.map(t => [t.id, t.label]));
          const tagNameToId = new Map(allTags.map(t => [t.label, t.id]));

          const mediaWithTagNames = allMedia.map(item => ({
            ...item,
            tagNames: item.tags.map((id: number) => tagIdToName.get(id) ?? `unknown-tag-${id}`),
          }));

          for (const tagName of allManagedTags) {
            const tagId = tagNameToId.get(tagName) ?? null;
            if (tagId !== null) {
              const taggedMedia = mediaWithTagNames.filter(m => m.tagNames.includes(tagName));
              if (taggedMedia.length > 0) {
                const taggedMediaIds = [...new Set(taggedMedia.map(media => service.getMediaId(media)))];
                await service.removeTag(instance, taggedMediaIds, tagId);
                totalCleared += taggedMediaIds.length;
              }
            }
          }

          await statsService.clearScoutarrTagsFromInstance(instance.id);

          const syncResult = await syncInstanceMedia({
            instanceId: instance.id,
            appType: appType as AppType,
            instance,
          });
          await statsService.syncMediaToDatabase(
            instance.id,
            syncResult.mediaWithTags as Parameters<typeof statsService.syncMediaToDatabase>[1]
          );

          totalInstances++;
        } catch (instanceError: unknown) {
          const msg = getErrorMessage(instanceError);
          logger.error(`❌ Failed to clear tags for ${appType} instance ${instance.id}`, { error: msg });
          errors.push(`${appType}/${instance.id}: ${msg}`);
        }
      }
    }

    if (errors.length > 0) {
      logger.warn('⚠️  Clear all tags completed with errors', { errors });
    }

    logger.info(`✅ Cleared tags across ${totalInstances} instances, ${totalCleared} items affected`);
    res.json({
      success: true,
      message: `Cleared tags across ${totalInstances} instance(s), ${totalCleared} item(s) affected`,
      totalInstances,
      totalCleared,
      errors,
    });
  } catch (error: unknown) {
    handleRouteError(res, error, 'Failed to clear all tags');
  }
});
