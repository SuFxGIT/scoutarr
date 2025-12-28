import Database from 'better-sqlite3';
import fs from 'fs/promises';
import path from 'path';
import logger from '../utils/logger.js';
import { getConfigDir } from '../utils/paths.js';
import { getErrorMessage } from '../utils/errorUtils.js';

const CONFIG_DIR = getConfigDir();
const DB_FILE = path.join(CONFIG_DIR, 'stats.db');

export interface TriggerEntry {
  timestamp: string;
  application: string;
  instance?: string; // Instance name/ID
  count: number;
  items: Array<{ id: number; title: string }>;
}

export interface Stats {
  totalTriggers: number;
  triggersByApplication: Record<string, number>;
  triggersByInstance: Record<string, number>; // Key: "application-instance" or "application" if no instance
  recentTriggers: TriggerEntry[];
  lastTrigger?: string;
}

class StatsService {
  private db: Database.Database | null = null;

  async initialize(): Promise<void> {
    logger.debug('⚙️  Initializing stats service', { dbFile: DB_FILE, configDir: CONFIG_DIR });
    try {
      logger.debug('📁 Ensuring config directory exists for stats database', { configDir: CONFIG_DIR });
      await fs.mkdir(CONFIG_DIR, { recursive: true });
      logger.debug('✅ Config directory ready');
      
      logger.debug('💾 Opening stats database', { dbFile: DB_FILE });
      this.db = new Database(DB_FILE);
      logger.debug('✅ Database connection established');
      
      logger.debug('📊 Creating database tables');
      this.createTables();
      logger.debug('✅ Database tables created');
      
      logger.info('✅ Stats service initialized successfully', { dbFile: DB_FILE });
    } catch (error: unknown) {
      const errorMessage = getErrorMessage(error);
      logger.error('❌ Error initializing stats service', { 
        error: errorMessage,
        dbFile: DB_FILE 
      });
      throw error;
    }
  }

  private createTables(): void {
    if (!this.db) throw new Error('Database not initialized');

    // Create triggers table (keeping table name as 'upgrades' for database compatibility)
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

    // Create tagged_media table to track which tags were added by this application
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS tagged_media (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        application TEXT NOT NULL,
        instance_id TEXT NOT NULL,
        tag_id INTEGER NOT NULL,
        media_id INTEGER NOT NULL,
        timestamp TEXT NOT NULL,
        UNIQUE(application, instance_id, tag_id, media_id)
      )
    `);

    // Create run_preview table to store the last run preview
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS run_preview (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        preview_data TEXT NOT NULL,
        created_at TEXT NOT NULL
      )
    `);

    // Create connection_status table to store connection test results
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS connection_status (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        application TEXT NOT NULL,
        instance_id TEXT,
        connected INTEGER NOT NULL,
        configured INTEGER NOT NULL,
        version TEXT,
        app_name TEXT,
        error TEXT,
        timestamp TEXT NOT NULL,
        UNIQUE(application, instance_id)
      )
    `);

    // Create indexes for better query performance
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_upgrades_timestamp ON upgrades(timestamp DESC);
      CREATE INDEX IF NOT EXISTS idx_upgrades_application ON upgrades(application);
      CREATE INDEX IF NOT EXISTS idx_upgrades_instance ON upgrades(instance);
      CREATE INDEX IF NOT EXISTS idx_tagged_media_app_instance ON tagged_media(application, instance_id);
      CREATE INDEX IF NOT EXISTS idx_tagged_media_tag_id ON tagged_media(tag_id);
      CREATE INDEX IF NOT EXISTS idx_tagged_media_media_id ON tagged_media(media_id);
      CREATE INDEX IF NOT EXISTS idx_connection_status_app_instance ON connection_status(application, instance_id);
    `);
  }

  async addTrigger(application: string, count: number, items: Array<{ id: number; title: string }>, instance?: string): Promise<void> {
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
    } catch (error: unknown) {
      const errorMessage = getErrorMessage(error);
      logger.error('❌ Error saving stats', { 
        error: errorMessage
      });
      throw error;
    }
  }

  private calculateStats(limit: number = 100): Stats {
    if (!this.db) {
      return {
        totalTriggers: 0,
        triggersByApplication: {},
        triggersByInstance: {},
        recentTriggers: [],
        lastTrigger: undefined
      };
    }

    // Get total triggers
    const totalStmt = this.db.prepare('SELECT SUM(count) as total FROM upgrades');
    const totalResult = totalStmt.get() as { total: number | null };
    const totalTriggers = totalResult.total || 0;

    // Get triggers by application
    const byAppStmt = this.db.prepare(`
      SELECT application, SUM(count) as total
      FROM upgrades
      GROUP BY application
    `);
    const byAppResults = byAppStmt.all() as Array<{ application: string; total: number }>;
    const triggersByApplication: Record<string, number> = {};
    for (const row of byAppResults) {
      triggersByApplication[row.application] = row.total;
    }

    // Get triggers by instance
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
    const triggersByInstance: Record<string, number> = {};
    for (const row of byInstanceResults) {
      triggersByInstance[row.instance_key] = row.total;
    }

    // Get recent triggers (limited for API response)
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

    const recentTriggers: TriggerEntry[] = recentResults.map(row => ({
      timestamp: row.timestamp,
      application: row.application,
      instance: row.instance || undefined,
      count: row.count,
      items: JSON.parse(row.items) as Array<{ id: number; title: string }>
    }));

    // Get last trigger timestamp
    const lastStmt = this.db.prepare(`
      SELECT timestamp
      FROM upgrades
      ORDER BY timestamp DESC
      LIMIT 1
    `);
    const lastResult = lastStmt.get() as { timestamp: string } | undefined;
    const lastTrigger = lastResult?.timestamp;

    return {
      totalTriggers,
      triggersByApplication,
      triggersByInstance,
      recentTriggers,
      lastTrigger
    };
  }

  async getStats(limit: number = 100): Promise<Stats> {
    logger.debug('📊 Getting stats', { limit });
    if (!this.db) {
      logger.warn('⚠️  Database not initialized, returning empty stats');
      return {
        totalTriggers: 0,
        triggersByApplication: {},
        triggersByInstance: {},
        recentTriggers: []
      };
    }

    try {
      logger.debug('📊 Calculating stats');
      const stats = this.calculateStats(limit);
      logger.debug('✅ Stats retrieved successfully', {
        totalTriggers: stats.totalTriggers,
        applicationsCount: Object.keys(stats.triggersByApplication).length,
        instancesCount: Object.keys(stats.triggersByInstance).length,
        recentTriggersCount: stats.recentTriggers.length
      });
      return stats;
    } catch (error: unknown) {
      const errorMessage = getErrorMessage(error);
      logger.error('❌ Error getting stats', { 
        error: errorMessage
      });
      return {
        totalTriggers: 0,
        triggersByApplication: {},
        triggersByInstance: {},
        recentTriggers: []
      };
    }
  }

  async getRecentTriggers(page: number = 1, pageSize: number = 15): Promise<{
    triggers: TriggerEntry[];
    total: number;
    totalPages: number;
  }> {
    logger.debug('📊 Getting recent triggers (paginated)', { page, pageSize });
    if (!this.db) {
      logger.warn('⚠️  Database not initialized, returning empty results');
      return { triggers: [], total: 0, totalPages: 0 };
    }

    try {
      logger.debug('📊 Counting total triggers');
      // Get total count
      const countStmt = this.db.prepare('SELECT COUNT(*) as count FROM upgrades');
      const countResult = countStmt.get() as { count: number };
      const total = countResult.count;
      const totalPages = Math.ceil(total / pageSize);
      logger.debug('✅ Total count calculated', { total, totalPages });

      // Get paginated results
      const offset = (page - 1) * pageSize;
      logger.debug('📊 Fetching paginated results', { offset, limit: pageSize });
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

      const triggers: TriggerEntry[] = results.map(row => ({
        timestamp: row.timestamp,
        application: row.application,
        instance: row.instance || undefined,
        count: row.count,
        items: JSON.parse(row.items) as Array<{ id: number; title: string }>
      }));

      logger.debug('✅ Recent triggers retrieved', { 
        count: triggers.length, 
        total, 
        totalPages,
        page 
      });

      return { triggers, total, totalPages };
    } catch (error: unknown) {
      const errorMessage = getErrorMessage(error);
      logger.error('❌ Error getting recent triggers', { 
        error: errorMessage
      });
      return { triggers: [], total: 0, totalPages: 0 };
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
      } catch (error: unknown) {
        // If file doesn't exist, that's okay
        const fileError = error as { code?: string; message?: string };
        if (fileError.code !== 'ENOENT') {
          logger.warn('⚠️  Could not delete stats database file', { error: fileError.message || 'Unknown error' });
        }
      }
      
      // Reinitialize the database (this will create a new file and tables)
      await this.initialize();
      
      logger.info('🔄 Stats reset - database recreated');
    } catch (error: unknown) {
      const errorMessage = getErrorMessage(error);
      logger.error('❌ Error resetting stats', { 
        error: errorMessage
      });
      throw error;
    }
  }

  async clearRecentTriggers(): Promise<void> {
    // Note: Since we're using a single database table for all triggers,
    // "clearing recent triggers" effectively clears all stats.
    // This method exists for API compatibility with the frontend.
    await this.resetStats();
  }

  async clearData(): Promise<void> {
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    try {
      // Delete all entries from the triggers table
      // This clears recent triggers and stats but keeps the database structure
      const deleteTriggersStmt = this.db.prepare('DELETE FROM upgrades');
      const triggersResult = deleteTriggersStmt.run();
      
      // Also clear all tagged media records
      const deleteTaggedMediaStmt = this.db.prepare('DELETE FROM tagged_media');
      const taggedMediaResult = deleteTaggedMediaStmt.run();
      
      logger.info('🗑️  Cleared all trigger data and tagged media records from stats database', { 
        triggersDeleted: triggersResult.changes,
        taggedMediaDeleted: taggedMediaResult.changes
      });
    } catch (error: unknown) {
      const errorMessage = getErrorMessage(error);
      logger.error('❌ Error clearing data', { 
        error: errorMessage
      });
      throw error;
    }
  }

  async addTaggedMedia(
    application: string,
    instanceId: string,
    tagId: number,
    mediaIds: number[]
  ): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    try {
      const timestamp = new Date().toISOString();
      const appKey = application.toLowerCase();

      const insertStmt = this.db.prepare(`
        INSERT OR IGNORE INTO tagged_media (application, instance_id, tag_id, media_id, timestamp)
        VALUES (?, ?, ?, ?, ?)
      `);

      // Insert each media ID individually
      for (const mediaId of mediaIds) {
        insertStmt.run(appKey, instanceId, tagId, mediaId, timestamp);
      }

      logger.debug('🏷️  Tagged media recorded', {
        application: appKey,
        instanceId,
        tagId,
        count: mediaIds.length
      });
    } catch (error: unknown) {
      const errorMessage = getErrorMessage(error);
      logger.error('❌ Error recording tagged media', {
        error: errorMessage
      });
      throw error;
    }
  }

  async getTaggedMediaIds(application: string, instanceId: string, tagId: number): Promise<number[]> {
    if (!this.db) {
      logger.warn('⚠️  Database not initialized, returning empty array');
      return [];
    }

    try {
      const appKey = application.toLowerCase();
      const stmt = this.db.prepare(`
        SELECT DISTINCT media_id
        FROM tagged_media
        WHERE application = ? AND instance_id = ? AND tag_id = ?
      `);
      const results = stmt.all(appKey, instanceId, tagId) as Array<{ media_id: number }>;
      return results.map(row => row.media_id);
    } catch (error: unknown) {
      const errorMessage = getErrorMessage(error);
      logger.error('❌ Error getting tagged media IDs', {
        error: errorMessage
      });
      return [];
    }
  }

  async getMediaLastTriggered(
    application: string,
    instanceId: string,
    mediaIds: number[]
  ): Promise<Map<number, string>> {
    if (!this.db) {
      logger.warn('⚠️  Database not initialized, returning empty map');
      return new Map();
    }

    if (mediaIds.length === 0) {
      return new Map();
    }

    try {
      const appKey = application.toLowerCase();
      const placeholders = mediaIds.map(() => '?').join(',');
      const stmt = this.db.prepare(`
        SELECT media_id, MAX(timestamp) as last_triggered
        FROM tagged_media
        WHERE application = ? AND instance_id = ? AND media_id IN (${placeholders})
        GROUP BY media_id
      `);
      const results = stmt.all(appKey, instanceId, ...mediaIds) as Array<{
        media_id: number;
        last_triggered: string;
      }>;

      const map = new Map<number, string>();
      for (const row of results) {
        map.set(row.media_id, row.last_triggered);
      }

      logger.debug('✅ Retrieved last triggered dates', {
        application: appKey,
        instanceId,
        count: map.size
      });
      return map;
    } catch (error: unknown) {
      const errorMessage = getErrorMessage(error);
      logger.error('❌ Error getting media last triggered dates', {
        error: errorMessage
      });
      return new Map();
    }
  }

  async clearTaggedMedia(application: string, instanceId: string, tagId: number): Promise<void> {
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    try {
      const appKey = application.toLowerCase();
      const deleteStmt = this.db.prepare(`
        DELETE FROM tagged_media
        WHERE application = ? AND instance_id = ? AND tag_id = ?
      `);
      const result = deleteStmt.run(appKey, instanceId, tagId);
      
      logger.info('🗑️  Cleared tagged media records', {
        application: appKey,
        instanceId,
        tagId,
        rowsDeleted: result.changes
      });
    } catch (error: unknown) {
      const errorMessage = getErrorMessage(error);
      logger.error('❌ Error clearing tagged media', {
        error: errorMessage
      });
      throw error;
    }
  }

  async saveRunPreview(previewData: unknown): Promise<void> {
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    try {
      // Delete existing preview
      const deleteStmt = this.db.prepare('DELETE FROM run_preview');
      deleteStmt.run();
      
      // Insert new preview
      const insertStmt = this.db.prepare(`
        INSERT INTO run_preview (preview_data, created_at)
        VALUES (?, ?)
      `);
      insertStmt.run(JSON.stringify(previewData), new Date().toISOString());
      logger.debug('💾 Run preview saved to database');
    } catch (error: unknown) {
      const errorMessage = getErrorMessage(error);
      logger.error('❌ Error saving run preview', {
        error: errorMessage,
        stack: error instanceof Error ? error.stack : undefined
      });
      throw error;
    }
  }

  async getRunPreview(): Promise<unknown | null> {
    if (!this.db) {
      logger.warn('⚠️  Database not initialized, returning null for run preview');
      return null;
    }

    try {
      const stmt = this.db.prepare('SELECT preview_data FROM run_preview ORDER BY id DESC LIMIT 1');
      const row = stmt.get() as { preview_data: string } | undefined;
      if (!row) {
        logger.debug('ℹ️  No run preview found in database');
        return null;
      }
      const preview = JSON.parse(row.preview_data);
      logger.debug('✅ Run preview retrieved from database');
      return preview;
    } catch (error: unknown) {
      const errorMessage = getErrorMessage(error);
      logger.error('❌ Error getting run preview', {
        error: errorMessage
      });
      return null;
    }
  }

  async clearRunPreview(): Promise<void> {
    if (!this.db) {
      logger.debug('ℹ️  Database not initialized, nothing to clear');
      return;
    }

    try {
      const deleteStmt = this.db.prepare('DELETE FROM run_preview');
      const result = deleteStmt.run();
      logger.debug('🗑️  Cleared run preview from database', {
        rowsDeleted: result.changes
      });
    } catch (error: unknown) {
      const errorMessage = getErrorMessage(error);
      logger.error('❌ Error clearing run preview', {
        error: errorMessage
      });
      // Don't throw - clearing is not critical
    }
  }

  async saveConnectionStatus(
    application: string,
    instanceId: string | null,
    connected: boolean,
    configured: boolean,
    version?: string,
    appName?: string,
    error?: string
  ): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    try {
      const timestamp = new Date().toISOString();
      const appKey = application.toLowerCase();

      const insertStmt = this.db.prepare(`
        INSERT OR REPLACE INTO connection_status 
        (application, instance_id, connected, configured, version, app_name, error, timestamp)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);

      insertStmt.run(
        appKey,
        instanceId || null,
        connected ? 1 : 0,
        configured ? 1 : 0,
        version || null,
        appName || null,
        error || null,
        timestamp
      );

      logger.debug('💾 Connection status saved', {
        application: appKey,
        instanceId,
        connected,
        configured
      });
    } catch (error: unknown) {
      const errorMessage = getErrorMessage(error);
      logger.error('❌ Error saving connection status', {
        error: errorMessage
      });
      throw error;
    }
  }

  async getConnectionStatus(): Promise<Record<string, { connected: boolean; configured: boolean; version?: string; appName?: string; error?: string; instanceName?: string }>> {
    if (!this.db) {
      logger.warn('⚠️  Database not initialized, returning empty connection status');
      return {};
    }

    try {
      const stmt = this.db.prepare(`
        SELECT application, instance_id, connected, configured, version, app_name, error
        FROM connection_status
        ORDER BY timestamp DESC
      `);
      const results = stmt.all() as Array<{
        application: string;
        instance_id: string | null;
        connected: number;
        configured: number;
        version: string | null;
        app_name: string | null;
        error: string | null;
      }>;

      const status: Record<string, { connected: boolean; configured: boolean; version?: string; appName?: string; error?: string; instanceName?: string }> = {};
      
      for (const row of results) {
        const key = row.instance_id ? `${row.application}-${row.instance_id}` : row.application;
        status[key] = {
          connected: row.connected === 1,
          configured: row.configured === 1,
          version: row.version || undefined,
          appName: row.app_name || undefined,
          error: row.error || undefined
        };
      }

      logger.debug('✅ Connection status retrieved', { count: Object.keys(status).length });
      return status;
    } catch (error: unknown) {
      const errorMessage = getErrorMessage(error);
      logger.error('❌ Error getting connection status', {
        error: errorMessage
      });
      return {};
    }
  }

  close(): void {
    if (this.db) {
      logger.debug('🔄 Closing stats database connection');
      this.db.close();
      this.db = null;
      logger.debug('✅ Stats database connection closed');
    } else {
      logger.debug('ℹ️  No database connection to close');
    }
  }
}

export const statsService = new StatsService();
