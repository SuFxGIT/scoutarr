import express from 'express';
import { configService } from '../services/configService.js';
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
        enabled: true, // Assume enabled for testing
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
    const { testStarrConnection, createStarrClient } = await import('../utils/starrUtils.js');
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

