import express from 'express';
import { configService } from '../services/configService.js';
import { statsService } from '../services/statsService.js';
import { schedulerService } from '../services/schedulerService.js';
import { testStarrConnection, getMediaTypeKey, APP_TYPES, AppType } from '../utils/starrUtils.js';
import { getServiceForApp } from '../utils/serviceRegistry.js';
import { handleRouteError, getErrorMessage } from '../utils/errorUtils.js';
import logger from '../utils/logger.js';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Config, StarrInstanceConfig } from '@scoutarr/shared';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const configRouter = express.Router();

// Helper function to clear log files
async function clearLogs(): Promise<void> {
  const logsDir = path.join(__dirname, '../../../logs');
  const logFiles = ['combined.log', 'error.log', 'exceptions.log', 'rejections.log'];
  
  for (const logFile of logFiles) {
    const logPath = path.join(logsDir, logFile);
    try {
      // Delete the file instead of just clearing it
      await fs.unlink(logPath);
      logger.debug(`Deleted log file: ${logFile}`);
    } catch (error: unknown) {
      // If file doesn't exist, that's okay - just log and continue
      const nodeError = error as NodeJS.ErrnoException;
      if (nodeError.code !== 'ENOENT') {
        logger.warn(`Failed to delete log file ${logFile}: ${getErrorMessage(error)}`);
      }
    }
  }
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
    
    // Clear log files
    await clearLogs();
    
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
    const oldConfig = configService.getConfig();
    const newConfig = req.body as Config;
    
    logger.debug('🔄 Comparing old and new config for cache invalidation');
    logger.debug('💾 Saving updated configuration');
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
    // Shape used for testing connections
    let appConfig: { url: string; apiKey: string } | null = null;

    // Use config from request body if provided (for testing unsaved changes)
    if (req.body && typeof req.body.url === 'string' && typeof req.body.apiKey === 'string') {
      appConfig = {
        url: req.body.url,
        apiKey: req.body.apiKey
      };
    } else {
      // Fallback to saved config
      const config = configService.getConfig();
      const savedConfig = config.applications[app as AppType] as StarrInstanceConfig[] | undefined;

      if (Array.isArray(savedConfig)) {
        // Pick the first enabled instance with URL and API key
        const instance = savedConfig.find(
          (inst: StarrInstanceConfig) => inst && inst.enabled !== false && inst.url && inst.apiKey
        );
        if (instance) {
          appConfig = {
            url: instance.url,
            apiKey: instance.apiKey
          };
        }
      }
    }

    if (!appConfig) {
      logger.warn(`⚠️  ${app} is not configured`);
      return res.status(400).json({ error: 'Application URL and API Key are required' });
    }

    // Test connection using utility function
    const testResult = await testStarrConnection(appConfig.url, appConfig.apiKey, app);

    // Find instanceId from config by matching URL and API key
    let instanceId: string | null = null;
    const config = configService.getConfig();
    const appConfigs = config.applications[app as AppType] as StarrInstanceConfig[] | undefined;
    if (Array.isArray(appConfigs)) {
      const matchingInstance = appConfigs.find(
        (inst: StarrInstanceConfig) => inst.url === appConfig.url && inst.apiKey === appConfig.apiKey
      );
      if (matchingInstance) {
        instanceId = matchingInstance.id;
      }
    }

    if (testResult.success) {
      logger.info(`✅ Connection test successful for ${app}`, { 
        url: appConfig.url, 
        appName: testResult.appName, 
        version: testResult.version,
        instanceId
      });
      res.json({ 
        success: true, 
        appName: testResult.appName,
        version: testResult.version
      });
    } else {
      logger.error(`❌ Connection test failed for ${app}`, { 
        url: appConfig.url, 
        error: testResult.error,
        instanceId
      });
      res.status(500).json({
        error: 'Connection test failed',
        message: testResult.error || 'Unable to connect to application or application type mismatch'
      });
    }
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

    // Fetch quality profiles based on app type using service registry
    let profiles: Array<{ id: number; name: string }> = [];
    try {
      const service = getServiceForApp(app as AppType);
      profiles = await service.getQualityProfiles(instanceConfig);
    } catch (error: unknown) {
      return res.status(400).json({ error: getErrorMessage(error) });
    }

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

    // Create a temporary config object
    const tempConfig = { url, apiKey } as StarrInstanceConfig;

    // Fetch quality profiles based on app type using service registry
    let profiles: Array<{ id: number; name: string }> = [];
    try {
      const service = getServiceForApp(app as AppType);
      profiles = await service.getQualityProfiles(tempConfig);
    } catch (error: unknown) {
      return res.status(400).json({ error: getErrorMessage(error) });
    }

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
