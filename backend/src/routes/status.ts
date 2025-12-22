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
      appConfig: { url: string; apiKey: string }
    ) => {
      // Check if configured (has URL and API key)
      const isConfigured = !!(appConfig.url && appConfig.apiKey);
      
      if (!isConfigured) {
        logger.debug(`⚠️  ${appName} not configured (missing URL or API key)`);
        return { connected: false, configured: false };
      }
      
      // Test connection
      const connected = await testStarrConnection(appConfig.url, appConfig.apiKey, appName);
      
      return { connected, configured: true };
    };

    // Check Radarr instances
    if (Array.isArray(config.applications.radarr)) {
      for (const instance of config.applications.radarr) {
        const instanceId = instance.id || 'radarr-1';
        const instanceName = instance.name || `Radarr ${instance.instanceId || '1'}`;
        const instanceStatus = await checkAppStatus(instanceName, instance);
        status[instanceId] = {
          ...instanceStatus,
          instanceName,
          instanceId: instance.instanceId
        };
      }
    } else {
      status.radarr = await checkAppStatus('Radarr', config.applications.radarr);
    }

    // Check Sonarr instances
    if (Array.isArray(config.applications.sonarr)) {
      for (const instance of config.applications.sonarr) {
        const instanceId = instance.id || 'sonarr-1';
        const instanceName = instance.name || `Sonarr ${instance.instanceId || '1'}`;
        const instanceStatus = await checkAppStatus(instanceName, instance);
        status[instanceId] = {
          ...instanceStatus,
          instanceName,
          instanceId: instance.instanceId
        };
      }
    } else {
      status.sonarr = await checkAppStatus('Sonarr', config.applications.sonarr);
    }

    res.json(status);
  } catch (error: any) {
    logger.error('❌ Status check failed', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

