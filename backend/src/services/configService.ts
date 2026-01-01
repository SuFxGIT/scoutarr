import fs from 'fs/promises';
import path from 'path';
import { Config, configSchema } from '@scoutarr/shared';
import logger, { startOperation } from '../utils/logger.js';
import { getConfigDir } from '../utils/paths.js';
import { getErrorMessage } from '../utils/errorUtils.js';

const CONFIG_DIR = getConfigDir();
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');
const CONFIG_EXAMPLE = path.join(CONFIG_DIR, 'config.example.json');

class ConfigService {
  private config: Config | null = null;

  async initialize(): Promise<void> {
    const endOp = startOperation('ConfigService.initialize', { configDir: CONFIG_DIR, configFile: CONFIG_FILE });
    logger.debug('⚙️  Initializing configuration service', { configDir: CONFIG_DIR, configFile: CONFIG_FILE });
    try {
      // Ensure config directory exists
      logger.debug('📁 Ensuring config directory exists', { configDir: CONFIG_DIR });
      await fs.mkdir(CONFIG_DIR, { recursive: true });
      logger.debug('✅ Config directory ready', { configDir: CONFIG_DIR });

      // Check if config file exists, if not create from example
      try {
        await fs.access(CONFIG_FILE);
        logger.debug('✅ Config file exists', { configFile: CONFIG_FILE });
      } catch {
        // Config doesn't exist, copy from example
        logger.debug('⚠️  Config file not found, checking for example file', { configFile: CONFIG_FILE, exampleFile: CONFIG_EXAMPLE });
        try {
          const exampleContent = await fs.readFile(CONFIG_EXAMPLE, 'utf-8');
          await fs.writeFile(CONFIG_FILE, exampleContent);
          logger.info('📋 Created config file from example', { configFile: CONFIG_FILE, exampleFile: CONFIG_EXAMPLE });
        } catch {
          // Example doesn't exist, create default config
          logger.debug('⚠️  Example file not found, creating default config', { exampleFile: CONFIG_EXAMPLE });
          await this.createDefaultConfig();
        }
      }

      await this.loadConfig();
      logger.info('✅ Configuration initialized successfully', { configFile: CONFIG_FILE });
      endOp();
    } catch (error: unknown) {
      logger.error('❌ Error initializing configuration', {
        error: getErrorMessage(error),
        configFile: CONFIG_FILE
      });
      endOp({ error: getErrorMessage(error) }, false);
      throw error;
    }
  }

  private async createDefaultConfig(): Promise<void> {
    const endOp = startOperation('ConfigService.createDefaultConfig', { configFile: CONFIG_FILE });
    logger.debug('Creating default configuration file', { configFile: CONFIG_FILE });
    const defaultConfig: Config = {
      notifications: {
        discordWebhook: '',
        notifiarrPassthroughWebhook: '',
        notifiarrPassthroughDiscordChannelId: '',
        pushoverUserKey: '',
        pushoverApiToken: ''
      },
      applications: {
        radarr: [],
        sonarr: [],
        lidarr: [],
        readarr: []
      },
      scheduler: {
        enabled: false,
        schedule: '0 */6 * * *', // Every 6 hours by default
        unattended: false
      },
      tasks: {
        syncSchedule: '0 3 * * *', // Default: 3am daily
        syncEnabled: true
      }
    };

    await fs.writeFile(CONFIG_FILE, JSON.stringify(defaultConfig, null, 2));
    logger.debug('Default configuration file created', { configFile: CONFIG_FILE });
    endOp();
  }

  async loadConfig(): Promise<Config> {
    const endOp = startOperation('ConfigService.loadConfig', { configFile: CONFIG_FILE });
    logger.debug('📖 Loading configuration', { configFile: CONFIG_FILE });
    try {
      const content = await fs.readFile(CONFIG_FILE, 'utf-8');
      logger.debug('✅ Config file read successfully', { size: content.length });
      
      const parsedJson = JSON.parse(content);
      const validatedConfig = configSchema.parse(parsedJson) as unknown as Config;

      const instanceCounts = {
        radarr: validatedConfig.applications.radarr.length,
        sonarr: validatedConfig.applications.sonarr.length,
        lidarr: validatedConfig.applications.lidarr.length,
        readarr: validatedConfig.applications.readarr.length
      };

      this.config = validatedConfig;

      logger.debug('✅ Configuration loaded successfully', {
        configFile: CONFIG_FILE,
        instanceCounts,
        schedulerEnabled: validatedConfig.scheduler.enabled,
        schedulerSchedule: validatedConfig.scheduler.schedule
      });
      endOp({ instanceCounts }, true);
      return validatedConfig;
    } catch (error: unknown) {
      const errorMessage = getErrorMessage(error);
      const errorStack = error instanceof Error ? error.stack : undefined;
      logger.error('❌ Error loading configuration', { 
        error: errorMessage,
        stack: errorStack,
        configFile: CONFIG_FILE 
      });
      endOp({ error: errorMessage }, false);
      throw error;
    }
  }

  async resetToDefault(): Promise<Config> {
    const endOp = startOperation('ConfigService.resetToDefault', { configFile: CONFIG_FILE });
    try {
      await this.createDefaultConfig();
      const config = await this.loadConfig();
      logger.info('🔄 Configuration reset to default', { configFile: CONFIG_FILE });

      // Restart schedulers after reset (skip initial sync since config is empty)
      const { schedulerService } = await import('./schedulerService.js');
      schedulerService.restart();
      const { syncSchedulerService } = await import('./syncSchedulerService.js');
      syncSchedulerService.restart(true); // Skip initial sync on reset

      endOp({}, true);
      return config;
    } catch (error: unknown) {
      const errorMessage = getErrorMessage(error);
      const errorStack = error instanceof Error ? error.stack : undefined;
      logger.error('❌ Error resetting configuration to default', {
        error: errorMessage,
        stack: errorStack,
        configFile: CONFIG_FILE
      });
      endOp({ error: errorMessage }, false);
      throw error;
    }
  }

  async saveConfig(config: Config): Promise<void> {
    const endOp = startOperation('ConfigService.saveConfig', { configFile: CONFIG_FILE });
    logger.debug('💾 Saving configuration', { configFile: CONFIG_FILE });
    try {
      const validatedConfig = configSchema.parse(config) as unknown as Config;
      const configJson = JSON.stringify(validatedConfig, null, 2);
      await fs.writeFile(CONFIG_FILE, configJson);
      logger.debug('✅ Config file written successfully', { size: configJson.length });
      
      this.config = validatedConfig;
      
      // Count configured instances
      const instanceCounts = {
        radarr: Array.isArray(config.applications.radarr) ? config.applications.radarr.length : 0,
        sonarr: Array.isArray(config.applications.sonarr) ? config.applications.sonarr.length : 0,
        lidarr: Array.isArray(config.applications.lidarr) ? config.applications.lidarr.length : 0,
        readarr: Array.isArray(config.applications.readarr) ? config.applications.readarr.length : 0
      };
      
      logger.info('💾 Configuration saved successfully', { 
        configFile: CONFIG_FILE,
        instanceCounts,
        schedulerEnabled: config.scheduler?.enabled || false
      });
      
      // Restart schedulers if config changed (skip initial sync to avoid unnecessary API calls)
      logger.debug('🔄 Restarting schedulers due to config change');
      const { schedulerService } = await import('./schedulerService.js');
      schedulerService.restart();
      const { syncSchedulerService } = await import('./syncSchedulerService.js');
      syncSchedulerService.restart(true); // Skip initial sync on config save
      logger.debug('✅ Schedulers restarted');
      endOp({ instanceCounts }, true);
    } catch (error: unknown) {
      const errorMessage = getErrorMessage(error);
      const errorStack = error instanceof Error ? error.stack : undefined;
      const errorName = error instanceof Error ? error.name : 'Error';
      
      logger.error('❌ Error saving configuration', { 
        error: errorMessage,
        errorName,
        stack: errorStack,
        configFile: CONFIG_FILE,
        operation: 'saveConfig'
      });
      endOp({ error: errorMessage }, false);
      throw error;
    }
  }

  getConfig(): Config {
    if (!this.config) {
      logger.error('❌ Attempted to get config before initialization');
      throw new Error('Config not loaded');
    }
    return this.config;
  }
}

export const configService = new ConfigService();
