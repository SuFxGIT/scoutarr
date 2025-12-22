import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import logger from '../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CONFIG_DIR = process.env.CONFIG_DIR || path.join(__dirname, '../../../config');
const STATS_FILE = path.join(CONFIG_DIR, 'stats.json');

export interface UpgradeEntry {
  timestamp: string;
  application: string;
  instance?: string; // Instance name/ID
  count: number;
  items: Array<{ id: number; title: string }>;
}

export interface Stats {
  totalUpgrades: number;
  upgradesByApplication: Record<string, number>;
  upgradesByInstance: Record<string, number>; // Key: "application-instance" or "application" if no instance
  recentUpgrades: UpgradeEntry[];
  lastUpgrade?: string;
}

class StatsService {
  private stats: Stats | null = null;

  async initialize(): Promise<void> {
    try {
      await fs.mkdir(CONFIG_DIR, { recursive: true });
      await this.loadStats();
      logger.info('✅ Stats service initialized successfully', { statsFile: STATS_FILE });
    } catch (error: any) {
      logger.warn('⚠️  Error initializing stats, creating default stats', { 
        error: error.message,
        statsFile: STATS_FILE 
      });
      await this.createDefaultStats();
      await this.loadStats();
      logger.info('✅ Default stats created and loaded');
    }
  }

  private async createDefaultStats(): Promise<void> {
    const defaultStats: Stats = {
      totalUpgrades: 0,
      upgradesByApplication: {},
      upgradesByInstance: {},
      recentUpgrades: []
    };
    await fs.writeFile(STATS_FILE, JSON.stringify(defaultStats, null, 2));
  }

  async loadStats(): Promise<Stats> {
    try {
      const content = await fs.readFile(STATS_FILE, 'utf-8');
      const loaded = JSON.parse(content) as Stats;
      
      // Ensure all required properties exist (migration for old stats files)
      this.stats = {
        totalUpgrades: loaded.totalUpgrades || 0,
        upgradesByApplication: loaded.upgradesByApplication || {},
        upgradesByInstance: loaded.upgradesByInstance || {},
        recentUpgrades: loaded.recentUpgrades || [],
        lastUpgrade: loaded.lastUpgrade
      };
      
      return this.stats;
    } catch (error: any) {
      // If file doesn't exist, create default
      if (error.code === 'ENOENT') {
        await this.createDefaultStats();
        const content = await fs.readFile(STATS_FILE, 'utf-8');
        this.stats = JSON.parse(content) as Stats;
        return this.stats;
      }
      logger.error('❌ Error loading stats', { 
        error: error.message,
        statsFile: STATS_FILE 
      });
      throw error;
    }
  }

  async addUpgrade(application: string, count: number, items: Array<{ id: number; title: string }>, instance?: string): Promise<void> {
    try {
      const stats = await this.loadStats();
      
      // Ensure properties exist (defensive check)
      if (!stats.upgradesByApplication) {
        stats.upgradesByApplication = {};
      }
      if (!stats.upgradesByInstance) {
        stats.upgradesByInstance = {};
      }
      if (!stats.recentUpgrades) {
        stats.recentUpgrades = [];
      }
      
      const entry: UpgradeEntry = {
        timestamp: new Date().toISOString(),
        application: application.toLowerCase(),
        instance,
        count,
        items
      };

      stats.totalUpgrades = (stats.totalUpgrades || 0) + count;
      const appKey = application.toLowerCase();
      stats.upgradesByApplication[appKey] = 
        (stats.upgradesByApplication[appKey] || 0) + count;
      
      // Track by instance
      const instanceKey = instance ? `${appKey}-${instance}` : appKey;
      stats.upgradesByInstance[instanceKey] = 
        (stats.upgradesByInstance[instanceKey] || 0) + count;
      
      // Add to recent upgrades (keep last 15 entries for display, but store more for "View All")
      stats.recentUpgrades.unshift(entry);
      // Keep up to 100 entries for "View All" functionality, but display only shows 15
      if (stats.recentUpgrades.length > 100) {
        stats.recentUpgrades = stats.recentUpgrades.slice(0, 100);
      }

      stats.lastUpgrade = entry.timestamp;

      await fs.writeFile(STATS_FILE, JSON.stringify(stats, null, 2));
      this.stats = stats;
      logger.debug('📊 Stats updated', { 
        application,
        instance,
        count,
        totalUpgrades: stats.totalUpgrades
      });
    } catch (error: any) {
      logger.error('❌ Error saving stats', { 
        error: error.message,
        statsFile: STATS_FILE 
      });
      throw error;
    }
  }

  getStats(): Stats {
    if (!this.stats) {
      return {
        totalUpgrades: 0,
        upgradesByApplication: {},
        upgradesByInstance: {},
        recentUpgrades: []
      };
    }
    return this.stats;
  }

  async resetStats(): Promise<void> {
    await this.createDefaultStats();
    await this.loadStats();
    logger.info('🔄 Stats reset');
  }

  async clearRecentUpgrades(): Promise<void> {
    try {
      const stats = await this.loadStats();
      stats.recentUpgrades = [];
      await fs.writeFile(STATS_FILE, JSON.stringify(stats, null, 2));
      this.stats = stats;
      logger.info('🔄 Recent upgrades cleared');
    } catch (error: any) {
      logger.error('❌ Error clearing recent upgrades', { 
        error: error.message,
        statsFile: STATS_FILE 
      });
      throw error;
    }
  }
}

export const statsService = new StatsService();

