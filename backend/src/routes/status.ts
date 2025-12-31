import express from 'express';
import { configService } from '../services/configService.js';
import { schedulerService } from '../services/schedulerService.js';
import { syncSchedulerService } from '../services/syncSchedulerService.js';
import { testStarrConnection, getConfiguredInstances, APP_TYPES, AppType } from '../utils/starrUtils.js';
import logger from '../utils/logger.js';
import { StarrInstanceConfig, StatusResponse, InstanceStatus } from '@scoutarr/shared';
import { handleRouteError } from '../utils/errorUtils.js';

export const statusRouter = express.Router();

// Get status of all applications
statusRouter.get('/', async (req, res) => {
  const startTime = Date.now();
  logger.debug('📊 Status check requested');
  try {
    const config = configService.getConfig();
    logger.debug('📋 Checking status for all applications', {
      appTypes: APP_TYPES.length
    });
    const status: StatusResponse = {};

    // Helper to check application status
    const checkAppStatus = async (
      appType: AppType,
      appConfig: { url: string; apiKey: string },
      instanceName?: string
    ): Promise<InstanceStatus> => {
      // Check if configured (has URL and API key)
      const isConfigured = !!(appConfig.url && appConfig.apiKey);

      if (!isConfigured) {
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
    const checkInstances = async (appType: AppType, defaultName: string): Promise<void> => {
      const instances = getConfiguredInstances(config.applications[appType] as StarrInstanceConfig[]);

      if (instances.length === 0) {
        // No configured instances - mark app as not configured
        status[appType] = { connected: false, configured: false };
        return;
      }

      // Multiple instances
      for (const instance of instances) {
        const instanceId = instance.id;
        const instanceName = instance.name;
        const instanceStatus = await checkAppStatus(appType, instance, instanceName);
        status[instanceId] = {
          ...instanceStatus,
          instanceName
        };
      }
    };

    // Check instances for all app types
    const appTypeNames: Record<AppType, string> = {
      radarr: 'Radarr',
      sonarr: 'Sonarr',
      lidarr: 'Lidarr',
      readarr: 'Readarr'
    };
    
    for (const appType of APP_TYPES) {
      await checkInstances(appType, appTypeNames[appType]);
    }

    // Add scheduler status
    const schedulerStatus = schedulerService.getStatus(config);

    status.scheduler = {
      enabled: config.scheduler?.enabled || false,
      running: schedulerStatus.running,
      schedule: schedulerStatus.schedule,
      nextRun: schedulerStatus.nextRun
    };

    const duration = Date.now() - startTime;
    logger.debug('✅ Status check completed', { 
      duration: `${duration}ms`,
      instanceCount: Object.keys(status).filter(k => k !== 'scheduler').length,
      schedulerEnabled: status.scheduler.enabled
    });
    res.json(status);
  } catch (error: unknown) {
    handleRouteError(res, error, 'Status check failed');
  }
});

// Get scheduler status only (without connection checks)
statusRouter.get('/scheduler', async (req, res) => {
  try {
    const config = configService.getConfig();
    const schedulerStatus = schedulerService.getStatus(config);

    // Get sync scheduler status
    const syncConfig = config.tasks;
    const syncSchedule = syncSchedulerService.getCurrentSchedule();
    const syncNextRun = syncConfig?.syncEnabled && syncSchedule
      ? syncSchedulerService.getNextRunTime()
      : null;

    res.json({
      enabled: config.scheduler?.enabled || false,
      running: schedulerStatus.running,
      schedule: schedulerStatus.schedule,
      nextRun: schedulerStatus.nextRun,
      sync: {
        enabled: syncConfig?.syncEnabled || false,
        schedule: syncSchedule,
        nextRun: syncNextRun ? syncNextRun.toISOString() : null
      }
    });
  } catch (error: unknown) {
    handleRouteError(res, error, 'Failed to get scheduler status');
  }
});

// Get scheduler run history
statusRouter.get('/scheduler/history', async (req, res) => {
  try {
    const history = schedulerService.getHistory();
    res.json(history);
  } catch (error: unknown) {
    handleRouteError(res, error, 'Failed to get scheduler history');
  }
});

// Clear scheduler run history
statusRouter.post('/scheduler/history/clear', async (req, res) => {
  try {
    schedulerService.clearHistory();
    res.json({ success: true });
  } catch (error: unknown) {
    handleRouteError(res, error, 'Failed to clear scheduler history');
  }
});
