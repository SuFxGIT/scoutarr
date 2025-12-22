import express from 'express';
import { configService } from '../services/configService.js';
import { testStarrConnection } from '../utils/starrUtils.js';
import logger from '../utils/logger.js';

export const statusRouter = express.Router();

// Get status of all applications
statusRouter.get('/', async (req, res) => {
  logger.debug('📊 Status check requested');
  try {
    const config = configService.getConfig();
    const status: Record<string, any> = {};

    // Helper to check application status
    const checkAppStatus = async (
      appName: string,
      appConfig: { enabled: boolean; url: string; apiKey: string }
    ) => {
      if (appConfig.enabled && appConfig.url && appConfig.apiKey) {
        const connected = await testStarrConnection(appConfig.url, appConfig.apiKey, appName);
        return { connected };
      } else {
        logger.debug(`⚠️  ${appName} not configured`);
        return { connected: false, configured: false };
      }
    };

    // Test all applications
    status.radarr = await checkAppStatus('Radarr', config.applications.radarr);
    status.sonarr = await checkAppStatus('Sonarr', config.applications.sonarr);

    res.json(status);
  } catch (error: any) {
    logger.error('❌ Status check failed', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

