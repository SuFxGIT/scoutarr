import express from 'express';
import { configService } from '../services/configService.js';
import { qualityProfilesCacheService } from '../services/qualityProfilesCacheService.js';
import { statsService } from '../services/statsService.js';
import { radarrService } from '../services/radarrService.js';
import { sonarrService } from '../services/sonarrService.js';
import { lidarrService } from '../services/lidarrService.js';
import { readarrService } from '../services/readarrService.js';
import { testStarrConnection, getMediaTypeKey, APP_TYPES, AppType } from '../utils/starrUtils.js';
import logger from '../utils/logger.js';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

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
      await fs.writeFile(logPath, '', 'utf8');
      logger.debug(`Cleared log file: ${logFile}`);
    } catch (error: any) {
      // If file doesn't exist, that's okay - just log and continue
      if (error.code !== 'ENOENT') {
        logger.warn(`Failed to clear log file ${logFile}: ${error.message}`);
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
  } catch (error: any) {
    logger.error('❌ Failed to load config', { error: error.message });
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
    
    // Clear log files
    await clearLogs();
    
    logger.info('✅ App reset completed - all data cleared');
    res.json({ success: true, config });
  } catch (error: any) {
    logger.error('❌ Failed to reset app', { error: error.message });
    res.status(500).json({ error: 'Failed to reset app' });
  }
});

// Update config
configRouter.put('/', async (req, res) => {
  logger.info('💾 Config update requested');
  try {
    const oldConfig = configService.getConfig();
    const newConfig = req.body;
    
    // Invalidate quality profiles cache for instances where URL or API key changed
    for (const app of APP_TYPES) {
      const oldInstances = oldConfig.applications[app] || [];
      const newInstances = newConfig.applications?.[app] || [];
      
      for (const newInstance of newInstances) {
        const oldInstance = oldInstances.find((inst: any) => inst.id === newInstance.id);
        if (oldInstance) {
          // Check if URL or API key changed
          if (oldInstance.url !== newInstance.url || oldInstance.apiKey !== newInstance.apiKey) {
            await qualityProfilesCacheService.invalidateCache(app, newInstance.id);
          }
        }
      }
    }
    
    await configService.saveConfig(req.body);
    res.json({ success: true });
  } catch (error: any) {
    logger.error('❌ Failed to save config', { error: error.message });
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
      const savedConfig = config.applications[app as keyof typeof config.applications] as any;

      if (Array.isArray(savedConfig)) {
        // Pick the first enabled instance with URL and API key
        const instance = savedConfig.find(
          (inst: any) => inst && inst.enabled !== false && inst.url && inst.apiKey
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
  } catch (error: any) {
    logger.error(`❌ Connection test failed for ${app}`, {
      error: error.message
    });
    res.status(500).json({
      error: 'Connection test failed',
      message: error.message
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

    // Fetch quality profiles based on app type
    let profiles: any[] = [];
    try {
      profiles = await getQualityProfilesForApp(app, instanceConfig);
    } catch (error: any) {
      return res.status(400).json({ error: error.message });
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
  } catch (error: any) {
    logger.error(`❌ Failed to fetch quality profiles for ${app} instance ${instanceId}`, {
      error: error.message
    });
    res.status(500).json({ 
      error: 'Failed to fetch quality profiles',
      message: error.message 
    });
  }
});

// Get quality profiles for an application (using URL and API key from request body)
configRouter.post('/quality-profiles/:app', async (req, res) => {
  const { app } = req.params;
  logger.info(`📋 Fetching quality profiles for ${app}`);
  try {
    const { url, apiKey, instanceId, forceRefresh } = req.body;

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
    const tempConfig = { url, apiKey } as any;

    // Fetch quality profiles based on app type
    let profiles: any[] = [];
    try {
      profiles = await getQualityProfilesForApp(app, tempConfig);
    } catch (error: any) {
      return res.status(400).json({ error: error.message });
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
  } catch (error: any) {
    logger.error(`❌ Failed to fetch quality profiles for ${app}`, {
      error: error.message
    });
    res.status(500).json({ 
      error: 'Failed to fetch quality profiles',
      message: error.message 
    });
  }
});

// Get all cached quality profiles
configRouter.get('/quality-profiles', async (_req, res) => {
  logger.debug('📋 Fetching all cached quality profiles');
  try {
    const cachedProfiles = qualityProfilesCacheService.getAllCachedProfiles();
    res.json(cachedProfiles);
  } catch (error: any) {
    logger.error('❌ Failed to fetch cached quality profiles', {
      error: error.message
    });
    res.status(500).json({ 
      error: 'Failed to fetch cached quality profiles',
      message: error.message 
    });
  }
});

// Helper to find instance config
function findInstanceConfig(config: any, app: string, instanceId: string): any | null {
  const appConfig = config.applications[app as keyof typeof config.applications];
  if (!appConfig) return null;
  
  const instances = Array.isArray(appConfig) ? appConfig : [];
  return instances.find((inst: any) => inst.id === instanceId) || null;
}

// Service map for app-specific operations
const appServiceMap: Record<string, {
  getQualityProfiles: (config: any) => Promise<any[]>;
  getTagId: (config: any, tagName: string) => Promise<number | null>;
  getAllMedia: (config: any) => Promise<any[]>;
  removeTagFromMedia: (config: any, mediaIds: number[], tagId: number) => Promise<void>;
}> = {
  radarr: {
    getQualityProfiles: (config: any) => radarrService.getQualityProfiles(config),
    getTagId: (config: any, tagName: string) => radarrService.getTagId(config, tagName),
    getAllMedia: (config: any) => radarrService.getMovies(config),
    removeTagFromMedia: (config: any, mediaIds: number[], tagId: number) => radarrService.removeTagFromMovies(config, mediaIds, tagId)
  },
  sonarr: {
    getQualityProfiles: (config: any) => sonarrService.getQualityProfiles(config),
    getTagId: (config: any, tagName: string) => sonarrService.getTagId(config, tagName),
    getAllMedia: (config: any) => sonarrService.getSeries(config),
    removeTagFromMedia: (config: any, mediaIds: number[], tagId: number) => sonarrService.removeTagFromSeries(config, mediaIds, tagId)
  },
  lidarr: {
    getQualityProfiles: (config: any) => lidarrService.getQualityProfiles(config),
    getTagId: (config: any, tagName: string) => lidarrService.getTagId(config, tagName),
    getAllMedia: (config: any) => lidarrService.getArtists(config),
    removeTagFromMedia: (config: any, mediaIds: number[], tagId: number) => lidarrService.removeTagFromArtists(config, mediaIds, tagId)
  },
  readarr: {
    getQualityProfiles: (config: any) => readarrService.getQualityProfiles(config),
    getTagId: (config: any, tagName: string) => readarrService.getTagId(config, tagName),
    getAllMedia: (config: any) => readarrService.getAuthors(config),
    removeTagFromMedia: (config: any, mediaIds: number[], tagId: number) => readarrService.removeTagFromAuthors(config, mediaIds, tagId)
  }
};

// Helper to get service for app type
function getServiceForApp(app: string) {
  const service = appServiceMap[app];
  if (!service) {
    throw new Error(`Unsupported app type: ${app}`);
  }
  return service;
}

// Helper to get quality profiles service based on app type
async function getQualityProfilesForApp(app: string, config: any): Promise<any[]> {
  return await getServiceForApp(app).getQualityProfiles(config);
}

// Helper to get tag ID based on app type
async function getTagIdForApp(app: string, config: any, tagName: string): Promise<number | null> {
  return await getServiceForApp(app).getTagId(config, tagName);
}

// Helper to get all media based on app type
async function getAllMediaForApp(app: string, config: any): Promise<any[]> {
  return await getServiceForApp(app).getAllMedia(config);
}

// Helper to remove tag from media based on app type
async function removeTagFromMediaForApp(app: string, config: any, mediaIds: number[], tagId: number): Promise<void> {
  await getServiceForApp(app).removeTagFromMedia(config, mediaIds, tagId);
}

// Clear tags from all media in an instance
configRouter.post('/clear-tags/:app/:instanceId', async (req, res) => {
  const { app, instanceId } = req.params;
  logger.info(`🧹 Clearing tags for ${app} instance ${instanceId}`);
  try {
    const config = configService.getConfig();
    const instanceConfig = findInstanceConfig(config, app, instanceId);

    if (!instanceConfig || !instanceConfig.url || !instanceConfig.apiKey) {
      return res.status(400).json({ error: 'Instance not found or not configured' });
    }

    if (!instanceConfig.tagName) {
      return res.status(400).json({ error: 'Tag name not configured for this instance' });
    }

    // Get tag ID based on app type
    let tagId: number | null;
    try {
      tagId = await getTagIdForApp(app, instanceConfig, instanceConfig.tagName);
    } catch (error: any) {
      return res.status(400).json({ error: error.message });
    }

    if (tagId === null) {
      return res.json({ success: true, message: 'Tag does not exist, nothing to clear' });
    }

    // Get all media based on app type
    let allMedia: any[] = [];
    try {
      allMedia = await getAllMediaForApp(app, instanceConfig);
    } catch (error: any) {
      return res.status(400).json({ error: error.message });
    }

    // Filter media that has the tag
    const mediaWithTag = allMedia.filter((m: any) => m.tags && m.tags.includes(tagId));
    
    if (mediaWithTag.length === 0) {
      return res.json({ success: true, message: 'No media found with this tag' });
    }

    // Get media IDs
    const mediaIds = mediaWithTag.map((m: any) => m.id);

    // Remove tag from all media based on app type
    try {
      await removeTagFromMediaForApp(app, instanceConfig, mediaIds, tagId);
    } catch (error: any) {
      return res.status(400).json({ error: error.message });
    }

    // Get media type name for logging
    const mediaTypeName = getMediaTypeKey(app as AppType);

    logger.info(`✅ Cleared tag from ${mediaIds.length} ${mediaTypeName}`);
    res.json({ 
      success: true, 
      message: `Cleared tag from ${mediaIds.length} ${mediaTypeName}`,
      count: mediaIds.length
    });
  } catch (error: any) {
    logger.error(`❌ Failed to clear tags for ${app} instance ${instanceId}`, {
      error: error.message,
      stack: error.stack
    });
    res.status(500).json({ 
      error: 'Failed to clear tags',
      message: error.message 
    });
  }
});

