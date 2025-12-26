import express from 'express';
import { configService } from '../services/configService.js';
import { statsService } from '../services/statsService.js';
import { schedulerService } from '../services/schedulerService.js';
import { testStarrConnection, getMediaTypeKey, APP_TYPES, AppType } from '../utils/starrUtils.js';
import { getServiceForApp } from '../utils/serviceRegistry.js';
import { handleRouteError, getErrorMessage } from '../utils/errorUtils.js';
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
      const nodeError = error as NodeJS.ErrnoException;
      if (nodeError.code !== 'ENOENT') {
        logger.warn(`Failed to delete log file ${logFile}: ${getErrorMessage(error)}`);
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
    handleRouteError(res, error, 'Failed to load config');
  }
});

// Reset app (clears config, stats, and logs)
configRouter.post('/reset-app', async (_req, res) => {
  logger.info('🔄 App reset requested - clearing all data');
  try {
    // Reset config to default
    const config = await configService.resetToDefault();
    
    // Clear stats database
    await statsService.resetStats();
    
    // Clear scheduler history
    schedulerService.clearHistory();
    
    // Clear log files
    await clearLogs();
    
    logger.info('✅ App reset completed - all data cleared');
    res.json({ success: true, config });
  } catch (error: unknown) {
    handleRouteError(res, error, 'Failed to reset app');
  }
});

// Update config
configRouter.put('/', async (req, res) => {
  logger.info('💾 Config update requested');
  try {
    const oldConfig = configService.getConfig();
    const newConfig = req.body as Config;
    
    logger.debug('🔄 Comparing old and new config for cache invalidation');
    logger.debug('💾 Saving updated configuration');
    await configService.saveConfig(req.body);
    
    logger.info('✅ Config update completed');
    res.json({ success: true });
  } catch (error: unknown) {
    handleRouteError(res, error, 'Failed to save config');
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
    handleRouteError(res, error, 'Connection test failed');
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

    // Fetch quality profiles based on app type using service registry
    let profiles: Array<{ id: number; name: string }> = [];
    try {
      const service = getServiceForApp(app as AppType);
      profiles = await service.getQualityProfiles(instanceConfig);
    } catch (error: unknown) {
      return res.status(400).json({ error: getErrorMessage(error) });
    }

    logger.debug(`✅ Fetched ${profiles.length} quality profiles for ${app}`, { instanceId });
    res.json(profiles);
  } catch (error: unknown) {
    handleRouteError(res, error, 'Failed to fetch quality profiles');
  }
});

// Get quality profiles for an application (using URL and API key from request body)
configRouter.post('/quality-profiles/:app', async (req, res) => {
  const { app } = req.params;
  logger.info(`📋 Fetching quality profiles for ${app}`);
  try {
    const { url, apiKey } = req.body as {
      url?: string;
      apiKey?: string;
    };

    if (!url || !apiKey) {
      return res.status(400).json({ error: 'URL and API key are required' });
    }

    // Create a temporary config object
    const tempConfig = { url, apiKey } as StarrInstanceConfig;

    // Fetch quality profiles based on app type using service registry
    let profiles: Array<{ id: number; name: string }> = [];
    try {
      const service = getServiceForApp(app as AppType);
      profiles = await service.getQualityProfiles(tempConfig);
    } catch (error: unknown) {
      return res.status(400).json({ error: getErrorMessage(error) });
    }

    logger.debug(`✅ Fetched ${profiles.length} quality profiles for ${app}`);
    res.json(profiles);
  } catch (error: unknown) {
    handleRouteError(res, error, 'Failed to fetch quality profiles');
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
      return res.status(400).json({ error: getErrorMessage(error) });
    }

    if (tagId === null) {
      logger.info(`ℹ️  Tag does not exist, nothing to clear`, { tagName: instanceConfig.tagName });
      return res.json({ success: true, message: 'Tag does not exist, nothing to clear' });
    }

    logger.debug(`✅ Tag ID found`, { tagId });

    // Get media IDs that were tagged by this application (from database)
    const trackedMediaIds = await statsService.getTaggedMediaIds(app, instanceId, tagId);
    logger.debug(`📋 Found ${trackedMediaIds.length} tracked media items with tag`, {
      app,
      instanceId,
      tagId
    });
    
    if (trackedMediaIds.length === 0) {
      logger.info(`ℹ️  No tracked media found with tag`, { tagName: instanceConfig.tagName });
      return res.json({ success: true, message: 'No tracked media found with this tag' });
    }

    logger.debug(`📋 Prepared ${trackedMediaIds.length} tracked media IDs for tag removal`);

    // Remove tag from tracked media based on app type
    logger.debug(`🏷️  Removing tag from tracked media`, { count: trackedMediaIds.length });
    try {
      await service.removeTagFromMedia(instanceConfig, trackedMediaIds, tagId);
      logger.debug(`✅ Tag removal request completed`);
      
      // Clear tracked media records from database after successful removal
      await statsService.clearTaggedMedia(app, instanceId, tagId);
      logger.debug(`✅ Cleared tracked media records from database`);
    } catch (error: unknown) {
      return res.status(400).json({ error: getErrorMessage(error) });
    }

    // Get media type name for logging
    const mediaTypeName = getMediaTypeKey(app as AppType);

    logger.info(`✅ Cleared tag from ${trackedMediaIds.length} ${mediaTypeName}`, {
      app,
      instanceId,
      tagName: instanceConfig.tagName,
      tagId,
      count: trackedMediaIds.length
    });
    res.json({
      success: true,
      message: `Cleared tag from ${trackedMediaIds.length} ${mediaTypeName}`,
      count: trackedMediaIds.length
    });
  } catch (error: unknown) {
    handleRouteError(res, error, 'Failed to clear tags');
  }
});
