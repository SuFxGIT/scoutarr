import express from 'express';
import { configService } from '../services/configService.js';
import { schedulerService } from '../services/schedulerService.js';
import { testStarrConnection, getConfiguredInstances, APP_TYPES, AppType } from '../utils/starrUtils.js';
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
      appType: AppType,
      appConfig: { url: string; apiKey: string },
      instanceName?: string
    ) => {
      // Check if configured (has URL and API key)
      const isConfigured = !!(appConfig.url && appConfig.apiKey);
      
      if (!isConfigured) {
        const displayName = instanceName || appType;
        logger.debug(`⚠️  ${displayName} not configured (missing URL or API key)`);
        return { connected: false, configured: false };
      }
      
      // Test connection - pass appType (e.g., 'radarr') not instanceName
      const testResult = await testStarrConnection(appConfig.url, appConfig.apiKey, appType);
      
      return { 
        connected: testResult.success, 
        configured: true,
        version: testResult.version,
        appName: testResult.appName,
        error: testResult.error
      };
    };

    // Helper to check instances for an app
    const checkInstances = async (appType: AppType, defaultName: string) => {
      const instances = getConfiguredInstances(config.applications[appType] as any[]);

      if (instances.length === 0) {
        // No configured instances - mark app as not configured
        status[appType] = { connected: false, configured: false };
        return;
      }

      // Multiple instances
      for (const instance of instances) {
        const instanceId = (instance as any).id;
        const instanceName = (instance as any).name || `${defaultName} ${(instance as any).instanceId || instanceId}`;
        const instanceStatus = await checkAppStatus(appType, instance as any, instanceName);
        status[instanceId] = {
          ...instanceStatus,
          instanceName
        };
      }
    };

    // Check instances for all app types
    const appTypeNames: Record<string, string> = {
      radarr: 'Radarr',
      sonarr: 'Sonarr',
      lidarr: 'Lidarr',
      readarr: 'Readarr'
    };
    
    for (const appType of APP_TYPES) {
      await checkInstances(appType, appTypeNames[appType]);
    }

    // Add scheduler status
    const schedulerStatus = schedulerService.getStatus();
    
    // Check if any instance schedulers are enabled
    let anyInstanceEnabled = false;
    for (const appType of APP_TYPES) {
      const instances = getConfiguredInstances(config.applications[appType] as any[]);
      for (const instance of instances) {
        if (instance.scheduleEnabled && instance.schedule) {
          anyInstanceEnabled = true;
          break;
        }
      }
      if (anyInstanceEnabled) break;
    }
    
    // Enabled if global OR any instance scheduler is enabled
    const globalEnabled = config.scheduler?.enabled || false;
    
    status.scheduler = {
      enabled: globalEnabled || anyInstanceEnabled,
      globalEnabled: globalEnabled,
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

