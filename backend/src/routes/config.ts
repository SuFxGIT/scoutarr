import express from 'express';
import { configService } from '../services/configService.js';
import { radarrService } from '../services/radarrService.js';
import { sonarrService } from '../services/sonarrService.js';
import { testStarrConnection, createStarrClient } from '../utils/starrUtils.js';
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
    // Use config from request body if provided (for testing unsaved changes), otherwise use saved config
    let appConfig;
    if (req.body && req.body.url && req.body.apiKey) {
      // Use provided config from request body
      appConfig = {
        url: req.body.url,
        apiKey: req.body.apiKey
      };
    } else {
      // Use saved config
      const config = configService.getConfig();
      appConfig = config.applications[app as keyof typeof config.applications];
    }

    if (!appConfig || !appConfig.url || !appConfig.apiKey) {
      logger.warn(`⚠️  ${app} is not configured`);
      return res.status(400).json({ error: 'Application URL and API Key are required' });
    }

    // Test connection using utility function
    const connected = await testStarrConnection(appConfig.url, appConfig.apiKey, app);

    if (connected) {
      // Get system status for additional info
      try {
        const client = createStarrClient(appConfig.url, appConfig.apiKey);
        const response = await client.get('/api/v3/system/status');
        logger.info(`✅ Connection test successful for ${app}`, { url: appConfig.url });
        res.json({ success: true, status: response.data });
      } catch (error: any) {
        // Connection works but status call failed
        logger.info(`✅ Connection test successful for ${app}`, { url: appConfig.url });
        res.json({ success: true });
      }
    } else {
      logger.error(`❌ Connection test failed for ${app}`, { url: appConfig.url });
      res.status(500).json({
        error: 'Connection test failed',
        message: 'Unable to connect to application'
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

    // Get tag ID
    const tagId = app === 'radarr' 
      ? await radarrService.getTagId(instanceConfig, instanceConfig.tagName)
      : await sonarrService.getTagId(instanceConfig, instanceConfig.tagName);

    if (tagId === null) {
      return res.json({ success: true, message: 'Tag does not exist, nothing to clear' });
    }

    // Get all media
    let allMedia: any[] = [];
    if (app === 'radarr') {
      allMedia = await radarrService.getMovies(instanceConfig);
    } else {
      allMedia = await sonarrService.getSeries(instanceConfig);
    }

    // Filter media that has the tag
    const mediaWithTag = allMedia.filter((m: any) => m.tags && m.tags.includes(tagId));
    
    if (mediaWithTag.length === 0) {
      return res.json({ success: true, message: 'No media found with this tag' });
    }

    // Get media IDs
    const mediaIds = mediaWithTag.map((m: any) => m.id);

    // Remove tag from all media
    if (app === 'radarr') {
      await radarrService.removeTagFromMovies(instanceConfig, mediaIds, tagId);
    } else {
      await sonarrService.removeTagFromSeries(instanceConfig, mediaIds, tagId);
    }

    logger.info(`✅ Cleared tag from ${mediaIds.length} ${app === 'radarr' ? 'movies' : 'series'}`);
    res.json({ 
      success: true, 
      message: `Cleared tag from ${mediaIds.length} ${app === 'radarr' ? 'movies' : 'series'}`,
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

