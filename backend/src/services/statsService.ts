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
  count: number;
  items: Array<{ id: number; title: string }>;
}

export interface Stats {
  totalUpgrades: number;
  upgradesByApplication: Record<string, number>;
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
      recentUpgrades: []
    };
    await fs.writeFile(STATS_FILE, JSON.stringify(defaultStats, null, 2));
  }

  async loadStats(): Promise<Stats> {
    try {
      const content = await fs.readFile(STATS_FILE, 'utf-8');
      this.stats = JSON.parse(content) as Stats;
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

  async addUpgrade(application: string, count: number, items: Array<{ id: number; title: string }>): Promise<void> {
    try {
      const stats = await this.loadStats();
      const entry: UpgradeEntry = {
        timestamp: new Date().toISOString(),
        application: application.toLowerCase(),
        count,
        items
      };

      stats.totalUpgrades += count;
      stats.upgradesByApplication[application.toLowerCase()] = 
        (stats.upgradesByApplication[application.toLowerCase()] || 0) + count;
      
      // Add to recent upgrades (keep last 100 entries)
      stats.recentUpgrades.unshift(entry);
      if (stats.recentUpgrades.length > 100) {
        stats.recentUpgrades = stats.recentUpgrades.slice(0, 100);
      }

      stats.lastUpgrade = entry.timestamp;

      await fs.writeFile(STATS_FILE, JSON.stringify(stats, null, 2));
      this.stats = stats;
      logger.debug('📊 Stats updated', { 
        application,
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
}

export const statsService = new StatsService();

