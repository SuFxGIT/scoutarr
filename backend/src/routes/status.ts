import express from 'express';
import { configService } from '../services/configService.js';
import { schedulerService } from '../services/schedulerService.js';
import { testStarrConnection, getConfiguredInstances } from '../utils/starrUtils.js';
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

    // Helper to check instances for an app
    const checkInstances = async (appType: 'radarr' | 'sonarr' | 'lidarr' | 'readarr', defaultName: string) => {
      const instances = getConfiguredInstances(config.applications[appType] as any[]);

      if (instances.length === 0) {
        // No configured instances - mark app as not configured
        status[appType] = { connected: false, configured: false };
        return;
      }

      // Multiple instances
      for (const instance of instances) {
        const instanceId = (instance as any).id || `${appType}-1`;
        const instanceName =
          (instance as any).name || `${defaultName} ${(instance as any).instanceId || '1'}`;
        const instanceStatus = await checkAppStatus(instanceName, instance as any);
        status[instanceId] = {
          ...instanceStatus,
          instanceName,
          instanceId: (instance as any).instanceId
        };
      }
    };

    // Check Radarr instances
    await checkInstances('radarr', 'Radarr');

    // Check Sonarr instances
    await checkInstances('sonarr', 'Sonarr');

    // Check Lidarr instances
    await checkInstances('lidarr', 'Lidarr');

    // Check Readarr instances
    await checkInstances('readarr', 'Readarr');

    // Add scheduler status
    const schedulerStatus = schedulerService.getStatus();
    status.scheduler = {
      enabled: config.scheduler?.enabled || false,
      running: schedulerStatus.running,
      schedule: schedulerStatus.schedule,
      nextRun: schedulerStatus.nextRun,
      instances: schedulerStatus.instances
    };

    res.json(status);
  } catch (error: any) {
    logger.error('❌ Status check failed', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

// Get scheduler run history
statusRouter.get('/scheduler/history', async (req, res) => {
  try {
    const history = schedulerService.getHistory();
    res.json(history);
  } catch (error: any) {
    logger.error('❌ Failed to get scheduler history', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

// Clear scheduler run history
statusRouter.post('/scheduler/history/clear', async (req, res) => {
  try {
    schedulerService.clearHistory();
    res.json({ success: true });
  } catch (error: any) {
    logger.error('❌ Failed to clear scheduler history', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

