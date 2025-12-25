import Database from 'better-sqlite3';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import logger from '../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CONFIG_DIR = process.env.CONFIG_DIR || path.join(__dirname, '../../../config');
const DB_FILE = path.join(CONFIG_DIR, 'stats.db');

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
  private db: Database.Database | null = null;

  async initialize(): Promise<void> {
    try {
      await fs.mkdir(CONFIG_DIR, { recursive: true });
      this.db = new Database(DB_FILE);
      this.createTables();
      
      logger.info('✅ Stats service initialized successfully', { dbFile: DB_FILE });
    } catch (error: any) {
      logger.error('❌ Error initializing stats service', { 
        error: error.message,
        dbFile: DB_FILE 
      });
      throw error;
    }
  }

  private createTables(): void {
    if (!this.db) throw new Error('Database not initialized');

    // Create upgrades table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS upgrades (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT NOT NULL,
        application TEXT NOT NULL,
        instance TEXT,
        count INTEGER NOT NULL,
        items TEXT NOT NULL
      )
    `);

    // Create indexes for better query performance
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_upgrades_timestamp ON upgrades(timestamp DESC);
      CREATE INDEX IF NOT EXISTS idx_upgrades_application ON upgrades(application);
      CREATE INDEX IF NOT EXISTS idx_upgrades_instance ON upgrades(instance);
    `);
  }

  async addUpgrade(application: string, count: number, items: Array<{ id: number; title: string }>, instance?: string): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    try {
      const timestamp = new Date().toISOString();
      const appKey = application.toLowerCase();

      const insertStmt = this.db.prepare(`
        INSERT INTO upgrades (timestamp, application, instance, count, items)
        VALUES (?, ?, ?, ?, ?)
      `);

      insertStmt.run(
        timestamp,
        appKey,
        instance || null,
        count,
        JSON.stringify(items)
      );

      logger.debug('📊 Stats updated', { 
        application: appKey,
        instance,
        instanceValue: instance,
        count,
        itemsCount: items.length
      });
    } catch (error: any) {
      logger.error('❌ Error saving stats', { 
        error: error.message
      });
      throw error;
    }
  }

  async getStats(limit: number = 100): Promise<Stats> {
    if (!this.db) {
      return {
        totalUpgrades: 0,
        upgradesByApplication: {},
        upgradesByInstance: {},
        recentUpgrades: []
      };
    }

    try {
      // Get total upgrades
      const totalStmt = this.db.prepare('SELECT SUM(count) as total FROM upgrades');
      const totalResult = totalStmt.get() as { total: number | null };
      const totalUpgrades = totalResult.total || 0;

      // Get upgrades by application
      const byAppStmt = this.db.prepare(`
        SELECT application, SUM(count) as total
        FROM upgrades
        GROUP BY application
      `);
      const byAppResults = byAppStmt.all() as Array<{ application: string; total: number }>;
      const upgradesByApplication: Record<string, number> = {};
      for (const row of byAppResults) {
        upgradesByApplication[row.application] = row.total;
      }

      // Get upgrades by instance
      const byInstanceStmt = this.db.prepare(`
        SELECT 
          CASE 
            WHEN instance IS NOT NULL THEN application || '-' || instance
            ELSE application
          END as instance_key,
          SUM(count) as total
        FROM upgrades
        GROUP BY instance_key
      `);
      const byInstanceResults = byInstanceStmt.all() as Array<{ instance_key: string; total: number }>;
      const upgradesByInstance: Record<string, number> = {};
      for (const row of byInstanceResults) {
        upgradesByInstance[row.instance_key] = row.total;
      }

      // Get recent upgrades (limited for API response)
      const recentStmt = this.db.prepare(`
        SELECT timestamp, application, instance, count, items
        FROM upgrades
        ORDER BY timestamp DESC
        LIMIT ?
      `);
      const recentResults = recentStmt.all(limit) as Array<{
        timestamp: string;
        application: string;
        instance: string | null;
        count: number;
        items: string;
      }>;

      const recentUpgrades: UpgradeEntry[] = recentResults.map(row => ({
        timestamp: row.timestamp,
        application: row.application,
        instance: row.instance || undefined,
        count: row.count,
        items: JSON.parse(row.items)
      }));

      // Get last upgrade timestamp
      const lastStmt = this.db.prepare(`
        SELECT timestamp
        FROM upgrades
        ORDER BY timestamp DESC
        LIMIT 1
      `);
      const lastResult = lastStmt.get() as { timestamp: string } | undefined;
      const lastUpgrade = lastResult?.timestamp;

      return {
        totalUpgrades,
        upgradesByApplication,
        upgradesByInstance,
        recentUpgrades,
        lastUpgrade
      };
    } catch (error: any) {
      logger.error('❌ Error getting stats', { 
        error: error.message
      });
      return {
        totalUpgrades: 0,
        upgradesByApplication: {},
        upgradesByInstance: {},
        recentUpgrades: []
      };
    }
  }

  async getRecentUpgrades(page: number = 1, pageSize: number = 15): Promise<{
    upgrades: UpgradeEntry[];
    total: number;
    totalPages: number;
  }> {
    if (!this.db) {
      return { upgrades: [], total: 0, totalPages: 0 };
    }

    try {
      // Get total count
      const countStmt = this.db.prepare('SELECT COUNT(*) as count FROM upgrades');
      const countResult = countStmt.get() as { count: number };
      const total = countResult.count;
      const totalPages = Math.ceil(total / pageSize);

      // Get paginated results
      const offset = (page - 1) * pageSize;
      const stmt = this.db.prepare(`
        SELECT timestamp, application, instance, count, items
        FROM upgrades
        ORDER BY timestamp DESC
        LIMIT ? OFFSET ?
      `);
      const results = stmt.all(pageSize, offset) as Array<{
        timestamp: string;
        application: string;
        instance: string | null;
        count: number;
        items: string;
      }>;

      const upgrades: UpgradeEntry[] = results.map(row => ({
        timestamp: row.timestamp,
        application: row.application,
        instance: row.instance || undefined,
        count: row.count,
        items: JSON.parse(row.items)
      }));

      return { upgrades, total, totalPages };
    } catch (error: any) {
      logger.error('❌ Error getting recent upgrades', { 
        error: error.message
      });
      return { upgrades: [], total: 0, totalPages: 0 };
    }
  }

  async resetStats(): Promise<void> {
    try {
      // Close the database connection first
      if (this.db) {
        this.db.close();
        this.db = null;
      }
      
      // Delete the database file for a complete reset
      try {
        await fs.unlink(DB_FILE);
        logger.debug('🗑️  Deleted stats database file');
      } catch (error: any) {
        // If file doesn't exist, that's okay
        if (error.code !== 'ENOENT') {
          logger.warn('⚠️  Could not delete stats database file', { error: error.message });
        }
      }
      
      // Reinitialize the database (this will create a new file and tables)
      await this.initialize();
      
      logger.info('🔄 Stats reset - database recreated');
    } catch (error: any) {
      logger.error('❌ Error resetting stats', { 
        error: error.message
      });
      throw error;
    }
  }

  async clearRecentUpgrades(): Promise<void> {
    // Note: Since we're using a single database table for all upgrades,
    // "clearing recent upgrades" effectively clears all stats.
    // This method exists for API compatibility with the frontend.
    await this.resetStats();
  }

  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }
}

export const statsService = new StatsService();
