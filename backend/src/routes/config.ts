import express from 'express';
import { configService } from '../services/configService.js';
import { qualityProfilesCacheService } from '../services/qualityProfilesCacheService.js';
import { statsService } from '../services/statsService.js';
import { schedulerService } from '../services/schedulerService.js';
import { testStarrConnection, getMediaTypeKey, APP_TYPES, AppType } from '../utils/starrUtils.js';
import { getServiceForApp } from '../utils/serviceRegistry.js';
import logger from '../utils/logger.js';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Config, RadarrInstance, SonarrInstance, LidarrInstance, ReadarrInstance } from '../types/config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const configRouter = express.Router();

// Type for instance configs
type StarrInstanceConfig = RadarrInstance | SonarrInstance | LidarrInstance | ReadarrInstance;

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
      const fileError = error as { code?: string; message?: string };
      if (fileError.code !== 'ENOENT') {
        logger.warn(`Failed to delete log file ${logFile}: ${fileError.message || 'Unknown error'}`);
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
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('❌ Failed to load config', { error: errorMessage });
    res.status(500).json({ error: 'Failed to load config' });
  }
});

// Reset app (clears config, quality profiles cache, stats, and logs)
configRouter.post('/reset-app', async (_req, res) => {
  logger.info('🔄 App reset requested - clearing all data');
  try {
    // Reset config to default
    const config = await configService.resetToDefault();
    
    // Clear quality profiles cache
    await qualityProfilesCacheService.clearAllCache();
    
    // Clear stats database
    await statsService.resetStats();
    
    // Clear scheduler history
    schedulerService.clearHistory();
    
    // Clear log files
    await clearLogs();
    
    logger.info('✅ App reset completed - all data cleared');
    res.json({ success: true, config });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('❌ Failed to reset app', { error: errorMessage });
    res.status(500).json({ error: 'Failed to reset app' });
  }
});

// Update config
configRouter.put('/', async (req, res) => {
  logger.info('💾 Config update requested');
  try {
    const oldConfig = configService.getConfig();
    const newConfig = req.body as Config;
    
    logger.debug('🔄 Comparing old and new config for cache invalidation');
    let cacheInvalidations = 0;
    
    // Invalidate quality profiles cache for instances where URL or API key changed
    for (const app of APP_TYPES) {
      const oldInstances = oldConfig.applications[app] || [];
      const newInstances = newConfig.applications?.[app] || [];
      
      logger.debug(`📋 Checking ${app} instances for changes`, { 
        oldCount: oldInstances.length, 
        newCount: newInstances.length 
      });
      
      for (const newInstance of newInstances) {
        const oldInstance = oldInstances.find((inst: StarrInstanceConfig) => inst.id === newInstance.id);
        if (oldInstance) {
          // Check if URL or API key changed
          const urlChanged = oldInstance.url !== newInstance.url;
          const apiKeyChanged = oldInstance.apiKey !== newInstance.apiKey;
          
          if (urlChanged || apiKeyChanged) {
            logger.debug(`🔄 Invalidating cache for ${app} instance`, { 
              instanceId: newInstance.id,
              urlChanged,
              apiKeyChanged
            });
            await qualityProfilesCacheService.invalidateCache(app, newInstance.id);
            cacheInvalidations++;
          }
        }
      }
    }
    
    logger.debug('💾 Saving updated configuration', { cacheInvalidations });
    await configService.saveConfig(req.body);
    
    logger.info('✅ Config update completed', { cacheInvalidations });
    res.json({ success: true });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('❌ Failed to save config', { error: errorMessage });
    res.status(500).json({ error: 'Failed to save config' });
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

    if (testResult.success) {
      logger.info(`✅ Connection test successful for ${app}`, { 
        url: appConfig.url, 
        appName: testResult.appName, 
        version: testResult.version 
      });
      res.json({ 
        success: true, 
        appName: testResult.appName,
        version: testResult.version
      });
    } else {
      logger.error(`❌ Connection test failed for ${app}`, { 
        url: appConfig.url, 
        error: testResult.error 
      });
      res.status(500).json({
        error: 'Connection test failed',
        message: testResult.error || 'Unable to connect to application or application type mismatch'
      });
    }
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error(`❌ Connection test failed for ${app}`, {
      error: errorMessage
    });
    res.status(500).json({
      error: 'Connection test failed',
      message: errorMessage
    });
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

    // Check cache first
    const cachedProfiles = qualityProfilesCacheService.getCachedProfiles(
      app,
      instanceId,
      instanceConfig.url,
      instanceConfig.apiKey
    );

    if (cachedProfiles) {
      logger.debug(`✅ Using cached quality profiles for ${app} instance ${instanceId}`, { count: cachedProfiles.length });
      return res.json(cachedProfiles);
    }

    // Fetch quality profiles based on app type using service registry
    let profiles: Array<{ id: number; name: string }> = [];
    try {
      const service = getServiceForApp(app as AppType);
      profiles = await service.getQualityProfiles(instanceConfig);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return res.status(400).json({ error: errorMessage });
    }

    // Cache only id and name from profiles
    const profilesToCache = profiles.map(p => ({ id: p.id, name: p.name }));
    await qualityProfilesCacheService.setCachedProfiles(
      app,
      instanceId,
      instanceConfig.url,
      instanceConfig.apiKey,
      profilesToCache
    );

    logger.debug(`✅ Fetched ${profiles.length} quality profiles for ${app}`, { instanceId });
    res.json(profiles);
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error(`❌ Failed to fetch quality profiles for ${app} instance ${instanceId}`, {
      error: errorMessage
    });
    res.status(500).json({ 
      error: 'Failed to fetch quality profiles',
      message: errorMessage 
    });
  }
});

// Get quality profiles for an application (using URL and API key from request body)
configRouter.post('/quality-profiles/:app', async (req, res) => {
  const { app } = req.params;
  logger.info(`📋 Fetching quality profiles for ${app}`);
  try {
    const { url, apiKey, instanceId, forceRefresh } = req.body as {
      url?: string;
      apiKey?: string;
      instanceId?: string;
      forceRefresh?: boolean;
    };

    if (!url || !apiKey) {
      return res.status(400).json({ error: 'URL and API key are required' });
    }

    // If instanceId is provided and not forcing refresh, check cache first
    if (instanceId && !forceRefresh) {
      const cachedProfiles = qualityProfilesCacheService.getCachedProfiles(
        app,
        instanceId,
        url,
        apiKey
      );

      if (cachedProfiles) {
        logger.debug(`✅ Using cached quality profiles for ${app} instance ${instanceId}`, { count: cachedProfiles.length });
        return res.json(cachedProfiles);
      }
    }

    // If forcing refresh, invalidate cache first
    if (instanceId && forceRefresh) {
      await qualityProfilesCacheService.invalidateCache(app, instanceId);
    }

    // Create a temporary config object
    const tempConfig = { url, apiKey } as StarrInstanceConfig;

    // Fetch quality profiles based on app type using service registry
    let profiles: Array<{ id: number; name: string }> = [];
    try {
      const service = getServiceForApp(app as AppType);
      profiles = await service.getQualityProfiles(tempConfig);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return res.status(400).json({ error: errorMessage });
    }

    // Cache only id and name from profiles if instanceId is provided
    if (instanceId) {
      const profilesToCache = profiles.map(p => ({ id: p.id, name: p.name }));
      await qualityProfilesCacheService.setCachedProfiles(
        app,
        instanceId,
        url,
        apiKey,
        profilesToCache
      );
    }

    logger.debug(`✅ Fetched ${profiles.length} quality profiles for ${app}`);
    res.json(profiles);
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error(`❌ Failed to fetch quality profiles for ${app}`, {
      error: errorMessage
    });
    res.status(500).json({ 
      error: 'Failed to fetch quality profiles',
      message: errorMessage 
    });
  }
});

// Get all cached quality profiles
configRouter.get('/quality-profiles', async (_req, res) => {
  logger.debug('📋 Fetching all cached quality profiles');
  try {
    const cachedProfiles = qualityProfilesCacheService.getAllCachedProfiles();
    res.json(cachedProfiles);
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('❌ Failed to fetch cached quality profiles', {
      error: errorMessage
    });
    res.status(500).json({ 
      error: 'Failed to fetch cached quality profiles',
      message: errorMessage 
    });
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

    if (!instanceConfig.tagName) {
      logger.warn(`⚠️  Tag name not configured for instance`, { app, instanceId });
      return res.status(400).json({ error: 'Tag name not configured for this instance' });
    }

    logger.debug(`✅ Instance config found`, { 
      instanceName: instanceConfig.name,
      tagName: instanceConfig.tagName,
      url: instanceConfig.url
    });

    // Get service for app type
    const service = getServiceForApp(app as AppType);
    logger.debug(`🔧 Service retrieved for ${app}`);

    // Get tag ID based on app type
    logger.debug(`🏷️  Getting tag ID`, { tagName: instanceConfig.tagName });
    let tagId: number | null;
    try {
      tagId = await service.getTagId(instanceConfig, instanceConfig.tagName);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`❌ Failed to get tag ID`, { error: errorMessage, tagName: instanceConfig.tagName });
      return res.status(400).json({ error: errorMessage });
    }

    if (tagId === null) {
      logger.info(`ℹ️  Tag does not exist, nothing to clear`, { tagName: instanceConfig.tagName });
      return res.json({ success: true, message: 'Tag does not exist, nothing to clear' });
    }

    logger.debug(`✅ Tag ID found`, { tagId });

    // Get all media based on app type
    logger.debug(`📥 Fetching all media from ${app}`);
    let allMedia: Array<{ id: number; tags?: number[] }> = [];
    try {
      allMedia = await service.getAllMedia(instanceConfig);
      logger.debug(`✅ Fetched ${allMedia.length} media items`);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`❌ Failed to fetch media`, { error: errorMessage });
      return res.status(400).json({ error: errorMessage });
    }

    // Filter media that has the tag
    const mediaWithTag = allMedia.filter((m) => m.tags && m.tags.includes(tagId));
    logger.debug(`🔽 Filtered media with tag`, { 
      total: allMedia.length,
      withTag: mediaWithTag.length
    });
    
    if (mediaWithTag.length === 0) {
      logger.info(`ℹ️  No media found with tag`, { tagName: instanceConfig.tagName });
      return res.json({ success: true, message: 'No media found with this tag' });
    }

    // Get media IDs
    const mediaIds = mediaWithTag.map((m) => m.id);
    logger.debug(`📋 Prepared ${mediaIds.length} media IDs for tag removal`);

    // Remove tag from all media based on app type
    logger.debug(`🏷️  Removing tag from media`, { count: mediaIds.length });
    try {
      await service.removeTagFromMedia(instanceConfig, mediaIds, tagId);
      logger.debug(`✅ Tag removal request completed`);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`❌ Failed to remove tag from media`, { error: errorMessage });
      return res.status(400).json({ error: errorMessage });
    }

    // Get media type name for logging
    const mediaTypeName = getMediaTypeKey(app as AppType);

    logger.info(`✅ Cleared tag from ${mediaIds.length} ${mediaTypeName}`, {
      app,
      instanceId,
      tagName: instanceConfig.tagName,
      tagId,
      count: mediaIds.length
    });
    res.json({ 
      success: true, 
      message: `Cleared tag from ${mediaIds.length} ${mediaTypeName}`,
      count: mediaIds.length
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error(`❌ Failed to clear tags for ${app} instance ${instanceId}`, {
      error: errorMessage,
      stack: error instanceof Error ? error.stack : undefined
    });
    res.status(500).json({ 
      error: 'Failed to clear tags',
      message: errorMessage 
    });
  }
});
