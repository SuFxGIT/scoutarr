import express from 'express';
import { configService } from '../services/configService.js';
import { statsService } from '../services/statsService.js';
import { schedulerService } from '../services/schedulerService.js';
import { testStarrConnection, getMediaTypeKey, APP_TYPES, AppType } from '../utils/starrUtils.js';
import { getServiceForApp } from '../utils/serviceRegistry.js';
import { handleRouteError, getErrorMessage } from '../utils/errorUtils.js';
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

// Reset app (clears config, stats, and logs)
configRouter.post('/reset-app', async (_req, res) => {
  logger.info('🔄 App reset requested - clearing all data');
  try {
    // Reset config to default
    const config = await configService.resetToDefault();
    
    // Clear stats database
    await statsService.resetStats();
    
    // Clear scheduler history
    schedulerService.clearHistory();
    
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

    const status = testResult.success ? 200 : 500;
    const response = testResult.success
      ? { success: true, appName: testResult.appName, version: testResult.version }
      : { error: 'Connection test failed', message: testResult.error || 'Unable to connect' };

    logger[testResult.success ? 'info' : 'error'](
      `${testResult.success ? '✅' : '❌'} Connection test for ${app}`,
      { url: appConfig.url, ...testResult }
    );

    res.status(status).json(response);
  } catch (error: unknown) {
    handleRouteError(res, error, 'Connection test failed');
  }
});

// Get quality profiles for an application instance
configRouter.get('/quality-profiles/:app/:instanceId', async (req, res) => {
  const { app, instanceId } = req.params;
  logger.info(`📋 Fetching quality profiles for ${app} instance ${instanceId}`);
  try {
    const config = configService.getConfig();
    const instanceConfig = findInstanceConfig(config, app, instanceId);

    if (!instanceConfig || !instanceConfig.url || !instanceConfig.apiKey) {
      return res.status(400).json({ error: 'Instance not found or not configured' });
    }

    // Fetch quality profiles using service registry
    const service = getServiceForApp(app as AppType);
    const profiles = await service.getQualityProfiles(instanceConfig);

    logger.debug(`✅ Fetched ${profiles.length} quality profiles for ${app}`, { instanceId });
    res.json(profiles);
  } catch (error: unknown) {
    handleRouteError(res, error, 'Failed to fetch quality profiles');
  }
});

// Get quality profiles for an application (using URL and API key from request body)
configRouter.post('/quality-profiles/:app', async (req, res) => {
  const { app } = req.params;
  logger.info(`📋 Fetching quality profiles for ${app}`);
  try {
    const { url, apiKey } = req.body as {
      url?: string;
      apiKey?: string;
    };

    if (!url || !apiKey) {
      return res.status(400).json({ error: 'URL and API key are required' });
    }

    // Fetch quality profiles using service registry
    const service = getServiceForApp(app as AppType);
    const profiles = await service.getQualityProfiles({ url, apiKey } as StarrInstanceConfig);

    logger.debug(`✅ Fetched ${profiles.length} quality profiles for ${app}`);
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
    let allMedia: any[];
    try {
      allMedia = await service.getMedia(instanceConfig);
      logger.debug(`📋 Fetched ${allMedia.length} total media items from ${app}`);
    } catch (error: unknown) {
      logger.error(`❌ Failed to fetch media from ${app}`, { error: getErrorMessage(error) });
      return res.status(400).json({ error: `Failed to fetch media: ${getErrorMessage(error)}` });
    }

    // Convert tag IDs in media to tag names
    const mediaWithTagNames = await Promise.all(
      allMedia.map(async (item) => {
        const tagNames = await service.convertTagIdsToNames(instanceConfig, item.tags);
        return { ...item, tagNames };
      })
    );

    // Clear each managed tag
    let totalCleared = 0;
    for (const tagName of allManagedTags) {
      const tagId = await service.getTagId(instanceConfig, tagName);
      if (tagId !== null) {
        // Find media with this tag (by name)
        const taggedMedia = mediaWithTagNames.filter(m => m.tagNames.includes(tagName));
        if (taggedMedia.length > 0) {
          const taggedMediaIds = taggedMedia.map(media => service.getMediaId(media));
          logger.debug(`🏷️  Removing tag "${tagName}" from ${taggedMediaIds.length} items`);
          await service.removeTag(instanceConfig, taggedMediaIds, tagId);
          totalCleared += taggedMediaIds.length;
        }
      }
    }

    // Clear scoutarr_tags list from database
    await statsService.clearScoutarrTagsFromInstance(instanceId);
    logger.debug(`✅ Cleared scoutarr tags from instance database record`);

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
