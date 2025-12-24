import express from 'express';
import { configService } from '../services/configService.js';
import { radarrService } from '../services/radarrService.js';
import { sonarrService } from '../services/sonarrService.js';
import { lidarrService } from '../services/lidarrService.js';
import { readarrService } from '../services/readarrService.js';
import { testStarrConnection, createStarrClient, getMediaTypeKey } from '../utils/starrUtils.js';
import logger from '../utils/logger.js';

export const configRouter = express.Router();

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

// Reset config to default
configRouter.post('/reset', async (_req, res) => {
  logger.info('🔄 Config reset requested');
  try {
    const config = await configService.resetToDefault();
    res.json({ success: true, config });
  } catch (error: any) {
    logger.error('❌ Failed to reset config', { error: error.message });
    res.status(500).json({ error: 'Failed to reset config' });
  }
});

// Update config
configRouter.put('/', async (req, res) => {
  logger.info('💾 Config update requested');
  try {
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
        // For Radarr/Sonarr, pick the first enabled instance with URL and API key
        const instance = savedConfig.find(
          (inst: any) => inst && inst.enabled !== false && inst.url && inst.apiKey
        );
        if (instance) {
          appConfig = {
            url: instance.url,
            apiKey: instance.apiKey
          };
        }
      } else if (savedConfig && savedConfig.url && savedConfig.apiKey) {
        // Single-app style config
        appConfig = {
          url: savedConfig.url,
          apiKey: savedConfig.apiKey
        };
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

// Helper to find instance config
function findInstanceConfig(config: any, app: string, instanceId: string): any | null {
  const appConfig = config.applications[app as keyof typeof config.applications];
  if (!appConfig) return null;
  
  const instances = Array.isArray(appConfig) ? appConfig : [];
  return instances.find((inst: any) => inst.id === instanceId) || null;
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
    if (app === 'radarr') {
      tagId = await radarrService.getTagId(instanceConfig, instanceConfig.tagName);
    } else if (app === 'sonarr') {
      tagId = await sonarrService.getTagId(instanceConfig, instanceConfig.tagName);
    } else if (app === 'lidarr') {
      tagId = await lidarrService.getTagId(instanceConfig, instanceConfig.tagName);
    } else if (app === 'readarr') {
      tagId = await readarrService.getTagId(instanceConfig, instanceConfig.tagName);
    } else {
      return res.status(400).json({ error: `Unsupported app type: ${app}` });
    }

    if (tagId === null) {
      return res.json({ success: true, message: 'Tag does not exist, nothing to clear' });
    }

    // Get all media based on app type
    let allMedia: any[] = [];
    if (app === 'radarr') {
      allMedia = await radarrService.getMovies(instanceConfig);
    } else if (app === 'sonarr') {
      allMedia = await sonarrService.getSeries(instanceConfig);
    } else if (app === 'lidarr') {
      allMedia = await lidarrService.getArtists(instanceConfig);
    } else if (app === 'readarr') {
      allMedia = await readarrService.getAuthors(instanceConfig);
    }

    // Filter media that has the tag
    const mediaWithTag = allMedia.filter((m: any) => m.tags && m.tags.includes(tagId));
    
    if (mediaWithTag.length === 0) {
      return res.json({ success: true, message: 'No media found with this tag' });
    }

    // Get media IDs
    const mediaIds = mediaWithTag.map((m: any) => m.id);

    // Remove tag from all media based on app type
    if (app === 'radarr') {
      await radarrService.removeTagFromMovies(instanceConfig, mediaIds, tagId);
    } else if (app === 'sonarr') {
      await sonarrService.removeTagFromSeries(instanceConfig, mediaIds, tagId);
    } else if (app === 'lidarr') {
      await lidarrService.removeTagFromArtists(instanceConfig, mediaIds, tagId);
    } else if (app === 'readarr') {
      await readarrService.removeTagFromAuthors(instanceConfig, mediaIds, tagId);
    }

    // Get media type name for logging
    const mediaTypeName = getMediaTypeKey(app);

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

