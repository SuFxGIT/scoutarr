import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { Config } from '../types/config.js';
import logger from '../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CONFIG_DIR = process.env.CONFIG_DIR || path.join(__dirname, '../../../config');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');
const CONFIG_EXAMPLE = path.join(CONFIG_DIR, 'config.example.json');

class ConfigService {
  private config: Config | null = null;

  async initialize(): Promise<void> {
    try {
      // Ensure config directory exists
      await fs.mkdir(CONFIG_DIR, { recursive: true });

      // Check if config file exists, if not create from example
      try {
        await fs.access(CONFIG_FILE);
      } catch {
        // Config doesn't exist, copy from example
        try {
          const exampleContent = await fs.readFile(CONFIG_EXAMPLE, 'utf-8');
          await fs.writeFile(CONFIG_FILE, exampleContent);
        } catch {
          // Example doesn't exist, create default config
          await this.createDefaultConfig();
        }
      }

      await this.loadConfig();
      logger.info('✅ Configuration initialized successfully', { configFile: CONFIG_FILE });
    } catch (error: any) {
      logger.warn('⚠️  Error initializing config, creating default config', { 
        error: error.message,
        configFile: CONFIG_FILE 
      });
      await this.createDefaultConfig();
      await this.loadConfig();
      logger.info('✅ Default configuration created and loaded');
    }
  }

  private async createDefaultConfig(): Promise<void> {
    logger.debug('Creating default configuration file', { configFile: CONFIG_FILE });
    const defaultConfig: Config = {
      notifications: {
        discordWebhook: '',
        notifiarrPassthroughWebhook: '',
        notifiarrPassthroughDiscordChannelId: ''
      },
      applications: {
        radarr: {
          enabled: false,
          url: '',
          apiKey: '',
          count: 10,
          tagName: 'upgradinatorr',
          ignoreTag: '',
          monitored: true,
          movieStatus: 'released',
          qualityProfileName: '',
          unattended: false
        },
        sonarr: {
          enabled: false,
          url: '',
          apiKey: '',
          count: 5,
          tagName: 'upgradinatorr',
          ignoreTag: '',
          monitored: true,
          seriesStatus: '',
          qualityProfileName: '',
          unattended: false
        },
        lidarr: {
          enabled: false,
          url: '',
          apiKey: '',
          count: 5,
          tagName: 'upgradinatorr',
          ignoreTag: '',
          monitored: true,
          artistStatus: '',
          qualityProfileName: '',
          unattended: false
        },
        readarr: {
          enabled: false,
          url: '',
          apiKey: '',
          count: 5,
          tagName: 'upgradinatorr',
          ignoreTag: '',
          monitored: true,
          authorStatus: '',
          qualityProfileName: '',
          unattended: false
        }
      },
      scheduler: {
        enabled: false,
        schedule: '0 */6 * * *' // Every 6 hours by default
      }
    };

    await fs.writeFile(CONFIG_FILE, JSON.stringify(defaultConfig, null, 2));
    logger.debug('Default configuration file created', { configFile: CONFIG_FILE });
  }

  async loadConfig(): Promise<Config> {
    try {
      const content = await fs.readFile(CONFIG_FILE, 'utf-8');
      this.config = JSON.parse(content) as Config;
      logger.debug('Configuration loaded successfully', { 
        configFile: CONFIG_FILE,
        applications: Object.keys(this.config.applications).filter(
          app => this.config!.applications[app as keyof typeof this.config!.applications].enabled
        )
      });
      return this.config;
    } catch (error: any) {
      logger.error('❌ Error loading configuration', { 
        error: error.message,
        stack: error.stack,
        configFile: CONFIG_FILE 
      });
      throw error;
    }
  }

  async saveConfig(config: Config): Promise<void> {
    try {
      await fs.writeFile(CONFIG_FILE, JSON.stringify(config, null, 2));
      this.config = config;
      logger.info('💾 Configuration saved successfully', { 
        configFile: CONFIG_FILE,
        enabledApps: Object.keys(config.applications).filter(
          app => config.applications[app as keyof typeof config.applications].enabled
        )
      });
      
      // Restart scheduler if config changed
      const { schedulerService } = await import('./schedulerService.js');
      schedulerService.restart();
    } catch (error: any) {
      logger.error('❌ Error saving configuration', { 
        error: error.message,
        stack: error.stack,
        configFile: CONFIG_FILE 
      });
      throw error;
    }
  }

  getConfig(): Config {
    if (!this.config) {
      throw new Error('Config not loaded');
    }
    return this.config;
  }
}

export const configService = new ConfigService();

