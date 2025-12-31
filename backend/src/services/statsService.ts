import Database from 'better-sqlite3';
import fs from 'fs/promises';
import path from 'path';
import logger from '../utils/logger.js';
import { getConfigDir } from '../utils/paths.js';
import { getErrorMessage } from '../utils/errorUtils.js';

const CONFIG_DIR = getConfigDir();
const DB_FILE = path.join(CONFIG_DIR, 'scoutarr.db');

export interface SearchEntry {
  timestamp: string;
  application: string;
  instance?: string; // Instance name/ID
  count: number;
  items: Array<{ id: number; title: string }>;
}

export interface Stats {
  totalSearches: number;
  searchesByApplication: Record<string, number>;
  searchesByInstance: Record<string, number>; // Key: "application-instance" or "application" if no instance
  recentSearches: SearchEntry[];
  lastSearch?: string;
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

    // Create search history table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT NOT NULL,
        application TEXT NOT NULL,
        instance TEXT,
        count INTEGER NOT NULL,
        items TEXT NOT NULL
      )
    `);


    // Create instances table to store instance metadata
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS instances (
        instance_id TEXT PRIMARY KEY,
        application TEXT NOT NULL,
        display_name TEXT,
        scoutarr_tags TEXT,
        ignore_tags TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `);

    // Create media_library table to store media details
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS media_library (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        instance_id TEXT NOT NULL,
        media_id INTEGER NOT NULL,
        title TEXT NOT NULL,
        monitored INTEGER NOT NULL,
        tags TEXT NOT NULL,
        quality_profile_name TEXT,
        status TEXT NOT NULL,
        last_search_time TEXT,
        date_imported TEXT,
        has_file INTEGER NOT NULL DEFAULT 0,
        custom_format_score INTEGER,
        raw_data TEXT,
        synced_at TEXT NOT NULL,
        UNIQUE(instance_id, media_id),
        FOREIGN KEY (instance_id) REFERENCES instances(instance_id) ON DELETE CASCADE
      )
    `);


    // Create indexes for better query performance
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_history_timestamp ON history(timestamp DESC);
      CREATE INDEX IF NOT EXISTS idx_history_application ON history(application);
      CREATE INDEX IF NOT EXISTS idx_history_instance ON history(instance);
      CREATE INDEX IF NOT EXISTS idx_instances_application ON instances(application);
      CREATE INDEX IF NOT EXISTS idx_media_library_instance ON media_library(instance_id);
      CREATE INDEX IF NOT EXISTS idx_media_library_media_id ON media_library(media_id);
      CREATE INDEX IF NOT EXISTS idx_media_library_monitored ON media_library(monitored);
      CREATE INDEX IF NOT EXISTS idx_media_library_has_file ON media_library(has_file);
      CREATE INDEX IF NOT EXISTS idx_media_library_status ON media_library(status);
      CREATE INDEX IF NOT EXISTS idx_media_library_synced_at ON media_library(synced_at DESC);
    `);

  }

  async addSearch(application: string, count: number, items: Array<{ id: number; title: string }>, instance?: string): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    try {
      const timestamp = new Date().toISOString();
      const appKey = application.toLowerCase();

      const insertStmt = this.db.prepare(`
        INSERT INTO history (timestamp, application, instance, count, items)
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
        totalSearches: 0,
        searchesByApplication: {},
        searchesByInstance: {},
        recentSearches: [],
        lastSearch: undefined
      };
    }

    // Get total searches
    const totalStmt = this.db.prepare('SELECT SUM(count) as total FROM history');
    const totalResult = totalStmt.get() as { total: number | null };
    const totalSearches = totalResult.total || 0;

    // Get searches by application
    const byAppStmt = this.db.prepare(`
      SELECT application, SUM(count) as total
      FROM history
      GROUP BY application
    `);
    const byAppResults = byAppStmt.all() as Array<{ application: string; total: number }>;
    const searchesByApplication: Record<string, number> = {};
    for (const row of byAppResults) {
      searchesByApplication[row.application] = row.total;
    }

    // Get searches by instance
    const byInstanceStmt = this.db.prepare(`
      SELECT
        CASE
          WHEN instance IS NOT NULL THEN application || '-' || instance
          ELSE application
        END as instance_key,
        SUM(count) as total
      FROM history
      GROUP BY instance_key
    `);
    const byInstanceResults = byInstanceStmt.all() as Array<{ instance_key: string; total: number }>;
    const searchesByInstance: Record<string, number> = {};
    for (const row of byInstanceResults) {
      searchesByInstance[row.instance_key] = row.total;
    }

    // Get recent searches (limited for API response)
    const recentStmt = this.db.prepare(`
      SELECT timestamp, application, instance, count, items
      FROM history
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

    const recentSearches: SearchEntry[] = recentResults.map(row => ({
      timestamp: row.timestamp,
      application: row.application,
      instance: row.instance || undefined,
      count: row.count,
      items: JSON.parse(row.items) as Array<{ id: number; title: string }>
    }));

    // Get last search timestamp
    const lastStmt = this.db.prepare(`
      SELECT timestamp
      FROM history
      ORDER BY timestamp DESC
      LIMIT 1
    `);
    const lastResult = lastStmt.get() as { timestamp: string } | undefined;
    const lastSearch = lastResult?.timestamp;

    return {
      totalSearches,
      searchesByApplication,
      searchesByInstance,
      recentSearches,
      lastSearch
    };
  }

  async getStats(limit: number = 100): Promise<Stats> {
    logger.debug('📊 Getting stats', { limit });
    if (!this.db) {
      logger.warn('⚠️  Database not initialized, returning empty stats');
      return {
        totalSearches: 0,
        searchesByApplication: {},
        searchesByInstance: {},
        recentSearches: []
      };
    }

    try {
      logger.debug('📊 Calculating stats');
      const stats = this.calculateStats(limit);
      logger.debug('✅ Stats retrieved successfully', {
        totalSearches: stats.totalSearches,
        applicationsCount: Object.keys(stats.searchesByApplication).length,
        instancesCount: Object.keys(stats.searchesByInstance).length,
        recentSearchesCount: stats.recentSearches.length
      });
      return stats;
    } catch (error: unknown) {
      const errorMessage = getErrorMessage(error);
      logger.error('❌ Error getting stats', {
        error: errorMessage
      });
      return {
        totalSearches: 0,
        searchesByApplication: {},
        searchesByInstance: {},
        recentSearches: []
      };
    }
  }

  async getRecentSearches(page: number = 1, pageSize: number = 15): Promise<{
    searches: SearchEntry[];
    total: number;
    totalPages: number;
  }> {
    logger.debug('📊 Getting recent searches (paginated)', { page, pageSize });
    if (!this.db) {
      logger.warn('⚠️  Database not initialized, returning empty results');
      return { searches: [], total: 0, totalPages: 0 };
    }

    try {
      logger.debug('📊 Counting total searches');
      // Get total count
      const countStmt = this.db.prepare('SELECT COUNT(*) as count FROM history');
      const countResult = countStmt.get() as { count: number };
      const total = countResult.count;
      const totalPages = Math.ceil(total / pageSize);
      logger.debug('✅ Total count calculated', { total, totalPages });

      // Get paginated results
      const offset = (page - 1) * pageSize;
      logger.debug('📊 Fetching paginated results', { offset, limit: pageSize });
      const stmt = this.db.prepare(`
        SELECT timestamp, application, instance, count, items
        FROM history
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

      const searches: SearchEntry[] = results.map(row => ({
        timestamp: row.timestamp,
        application: row.application,
        instance: row.instance || undefined,
        count: row.count,
        items: JSON.parse(row.items) as Array<{ id: number; title: string }>
      }));

      logger.debug('✅ Recent searches retrieved', {
        count: searches.length,
        total,
        totalPages,
        page
      });

      return { searches, total, totalPages };
    } catch (error: unknown) {
      const errorMessage = getErrorMessage(error);
      logger.error('❌ Error getting recent searches', {
        error: errorMessage
      });
      return { searches: [], total: 0, totalPages: 0 };
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

  async clearRecentSearches(): Promise<void> {
    // Note: Since we're using a single database table for all searches,
    // "clearing recent searches" effectively clears all stats.
    // This method exists for API compatibility with the frontend.
    await this.resetStats();
  }

  async clearData(): Promise<void> {
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    try {
      // Delete all entries from the searches table
      // This clears recent searches and stats but keeps the database structure
      const deleteSearchesStmt = this.db.prepare('DELETE FROM history');
      const searchesResult = deleteSearchesStmt.run();

      logger.info('🗑️  Cleared all search data from stats database', {
        searchesDeleted: searchesResult.changes
      });
    } catch (error: unknown) {
      const errorMessage = getErrorMessage(error);
      logger.error('❌ Error clearing data', {
        error: errorMessage
      });
      throw error;
    }
  }

  // ========== Instance Management ==========

  async upsertInstance(
    instanceId: string,
    application: string,
    displayName?: string,
    scoutarrTags?: string[],
    ignoreTags?: string[]
  ): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    try {
      const now = new Date().toISOString();

      // If tags are provided, use them; otherwise preserve existing values
      if (scoutarrTags !== undefined || ignoreTags !== undefined) {
        const stmt = this.db.prepare(`
          INSERT INTO instances (instance_id, application, display_name, scoutarr_tags, ignore_tags, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(instance_id) DO UPDATE SET
            display_name = excluded.display_name,
            scoutarr_tags = excluded.scoutarr_tags,
            ignore_tags = excluded.ignore_tags,
            updated_at = excluded.updated_at
        `);
        stmt.run(
          instanceId,
          application.toLowerCase(),
          displayName || null,
          JSON.stringify(scoutarrTags || []),
          JSON.stringify(ignoreTags || []),
          now,
          now
        );
      } else {
        // Don't update tag columns if not provided
        const stmt = this.db.prepare(`
          INSERT INTO instances (instance_id, application, display_name, scoutarr_tags, ignore_tags, created_at, updated_at)
          VALUES (?, ?, ?, '[]', '[]', ?, ?)
          ON CONFLICT(instance_id) DO UPDATE SET
            display_name = excluded.display_name,
            updated_at = excluded.updated_at
        `);
        stmt.run(instanceId, application.toLowerCase(), displayName || null, now, now);
      }

      logger.debug('✅ Instance upserted', { instanceId, application, displayName });
    } catch (error: unknown) {
      const errorMessage = getErrorMessage(error);
      logger.error('❌ Error upserting instance', { error: errorMessage });
      throw error;
    }
  }

  async getInstance(instanceId: string): Promise<{
    instance_id: string;
    application: string;
    display_name: string | null;
    scoutarr_tags: string;
    ignore_tags: string;
    created_at: string;
    updated_at: string;
  } | null> {
    if (!this.db) return null;

    try {
      const stmt = this.db.prepare('SELECT * FROM instances WHERE instance_id = ?');
      const result = stmt.get(instanceId) as {
        instance_id: string;
        application: string;
        display_name: string | null;
        scoutarr_tags: string;
        ignore_tags: string;
        created_at: string;
        updated_at: string;
      } | undefined;

      return result || null;
    } catch (error: unknown) {
      const errorMessage = getErrorMessage(error);
      logger.error('❌ Error getting instance', { error: errorMessage });
      return null;
    }
  }

  /**
   * Add a scoutarr tag to an instance's tracked tags
   */
  async addScoutarrTagToInstance(instanceId: string, tagName: string): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    try {
      // Get current instance
      const instance = await this.getInstance(instanceId);
      if (!instance) {
        logger.warn('⚠️  Instance not found, cannot add tag', { instanceId, tagName });
        return;
      }

      const scoutarrTags = JSON.parse(instance.scoutarr_tags || '[]') as string[];

      // Add if not already present
      if (!scoutarrTags.includes(tagName)) {
        scoutarrTags.push(tagName);

        // Update database
        const stmt = this.db.prepare(`
          UPDATE instances SET scoutarr_tags = ?, updated_at = ? WHERE instance_id = ?
        `);
        stmt.run(JSON.stringify(scoutarrTags), new Date().toISOString(), instanceId);
        logger.debug('✅ Added scoutarr tag to instance', { instanceId, tagName });
      }
    } catch (error: unknown) {
      const errorMessage = getErrorMessage(error);
      logger.error('❌ Error adding scoutarr tag to instance', { error: errorMessage, instanceId, tagName });
      throw error;
    }
  }

  /**
   * Clear all scoutarr tags from an instance
   */
  async clearScoutarrTagsFromInstance(instanceId: string): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    try {
      const stmt = this.db.prepare(`
        UPDATE instances SET scoutarr_tags = '[]', updated_at = ? WHERE instance_id = ?
      `);
      stmt.run(new Date().toISOString(), instanceId);
      logger.info('🗑️  Cleared scoutarr tags from instance', { instanceId });
    } catch (error: unknown) {
      const errorMessage = getErrorMessage(error);
      logger.error('❌ Error clearing scoutarr tags from instance', { error: errorMessage, instanceId });
      throw error;
    }
  }

  // ========== Media Library Management ==========

  async syncMediaToDatabase(
    instanceId: string,
    mediaItems: Array<{
      id: number;
      title: string;
      monitored: boolean;
      tags: string[]; // Tag names, not IDs
      qualityProfileName?: string; // Profile name from API
      status: string;
      lastSearchTime?: string;
      added?: string;
      movieFile?: { dateAdded?: string };
      episodeFile?: { dateAdded?: string };
      trackFiles?: Array<{ dateAdded?: string }>;
      bookFiles?: Array<{ dateAdded?: string }>;
      [key: string]: unknown;
    }>
  ): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    try {
      const syncTime = new Date().toISOString();

      // Use a transaction for better performance
      const insertStmt = this.db.prepare(`
        INSERT INTO media_library (
          instance_id, media_id, title, monitored, tags, quality_profile_name,
          status, last_search_time, date_imported, has_file,
          custom_format_score, raw_data, synced_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(instance_id, media_id) DO UPDATE SET
          title = excluded.title,
          monitored = excluded.monitored,
          tags = excluded.tags,
          quality_profile_name = excluded.quality_profile_name,
          status = excluded.status,
          last_search_time = excluded.last_search_time,
          date_imported = excluded.date_imported,
          has_file = excluded.has_file,
          custom_format_score = excluded.custom_format_score,
          raw_data = excluded.raw_data,
          synced_at = excluded.synced_at
      `);

      const transaction = this.db.transaction((items: typeof mediaItems) => {
        for (const item of items) {
          // Extract dateImported and customFormatScore from file
          let dateImported: string | undefined;
          let hasFile = 0;
          let customFormatScore: number | null = null;

          if (item.movieFile?.dateAdded) {
            dateImported = item.movieFile.dateAdded;
            hasFile = 1;
            customFormatScore = (item.movieFile as { customFormatScore?: number }).customFormatScore ?? null;
          } else if (item.episodeFile?.dateAdded) {
            dateImported = item.episodeFile.dateAdded;
            hasFile = 1;
            customFormatScore = (item.episodeFile as { customFormatScore?: number }).customFormatScore ?? null;
          } else if (item.trackFiles && item.trackFiles.length > 0) {
            const dates = item.trackFiles
              .map(f => f.dateAdded)
              .filter((d): d is string => !!d);
            if (dates.length > 0) {
              dateImported = dates.sort().reverse()[0];
              hasFile = 1;
              // For Lidarr, get customFormatScore from the most recent track file
              const trackWithScore = item.trackFiles.find(f => (f as { customFormatScore?: number }).customFormatScore !== undefined);
              customFormatScore = trackWithScore ? ((trackWithScore as { customFormatScore?: number }).customFormatScore ?? null) : null;
            }
          } else if (item.bookFiles && item.bookFiles.length > 0) {
            const dates = item.bookFiles
              .map(f => f.dateAdded)
              .filter((d): d is string => !!d);
            if (dates.length > 0) {
              dateImported = dates.sort().reverse()[0];
              hasFile = 1;
              // For Readarr, get customFormatScore from the most recent book file
              const bookWithScore = item.bookFiles.find(f => (f as { customFormatScore?: number }).customFormatScore !== undefined);
              customFormatScore = bookWithScore ? ((bookWithScore as { customFormatScore?: number }).customFormatScore ?? null) : null;
            }
          }

          insertStmt.run(
            instanceId,
            item.id,
            item.title,
            item.monitored ? 1 : 0,
            JSON.stringify(item.tags),
            item.qualityProfileName || null,
            item.status,
            item.lastSearchTime || null,
            dateImported || null,
            hasFile,
            customFormatScore,
            JSON.stringify(item), // Store full raw data for future use
            syncTime
          );
        }
      });

      transaction(mediaItems);

      logger.info('✅ Media synced to database', {
        instanceId,
        count: mediaItems.length,
        syncTime
      });
    } catch (error: unknown) {
      const errorMessage = getErrorMessage(error);
      const errorStack = error instanceof Error ? error.stack : undefined;
      logger.error('❌ Error syncing media to database', {
        error: errorMessage,
        stack: errorStack,
        instanceId,
        itemCount: mediaItems.length
      });
      throw error;
    }
  }

  async getMediaFromDatabase(
    instanceId: string,
    filters?: {
      monitored?: boolean;
      hasFile?: boolean;
      status?: string;
    }
  ): Promise<Array<{
    id: number;
    instance_id: string;
    media_id: number;
    title: string;
    monitored: boolean;
    tags: string[]; // Tag names, not IDs
    quality_profile_name: string | null; // Profile name
    status: string;
    last_search_time: string | null;
    date_imported: string | null;
    has_file: boolean;
    custom_format_score: number | null;
    synced_at: string;
  }>> {
    if (!this.db) return [];

    try {
      let query = 'SELECT * FROM media_library WHERE instance_id = ?';
      const params: unknown[] = [instanceId];

      if (filters?.monitored !== undefined) {
        query += ' AND monitored = ?';
        params.push(filters.monitored ? 1 : 0);
      }

      if (filters?.hasFile !== undefined) {
        query += ' AND has_file = ?';
        params.push(filters.hasFile ? 1 : 0);
      }

      if (filters?.status) {
        query += ' AND status = ?';
        params.push(filters.status);
      }

      query += ' ORDER BY title ASC';

      const stmt = this.db.prepare(query);
      const results = stmt.all(...params) as Array<{
        id: number;
        instance_id: string;
        media_id: number;
        title: string;
        monitored: number;
        tags: string;
        quality_profile_name: string | null;
        status: string;
        last_search_time: string | null;
        date_imported: string | null;
        has_file: number;
        custom_format_score: number | null;
        synced_at: string;
      }>;

      return results.map(row => ({
        id: row.id,
        instance_id: row.instance_id,
        media_id: row.media_id,
        title: row.title,
        monitored: row.monitored === 1,
        tags: JSON.parse(row.tags) as string[], // Tag names, not IDs
        quality_profile_name: row.quality_profile_name,
        status: row.status,
        last_search_time: row.last_search_time,
        date_imported: row.date_imported,
        has_file: row.has_file === 1,
        custom_format_score: row.custom_format_score,
        synced_at: row.synced_at
      }));
    } catch (error: unknown) {
      const errorMessage = getErrorMessage(error);
      logger.error('❌ Error getting media from database', { error: errorMessage });
      return [];
    }
  }

  async deleteMediaForInstance(instanceId: string): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    try {
      const stmt = this.db.prepare('DELETE FROM media_library WHERE instance_id = ?');
      const result = stmt.run(instanceId);

      logger.info('🗑️  Deleted media for instance', {
        instanceId,
        rowsDeleted: result.changes
      });
    } catch (error: unknown) {
      const errorMessage = getErrorMessage(error);
      logger.error('❌ Error deleting media for instance', { error: errorMessage });
      throw error;
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
