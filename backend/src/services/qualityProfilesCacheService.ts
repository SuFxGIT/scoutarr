import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import logger from '../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CONFIG_DIR = process.env.CONFIG_DIR || path.join(__dirname, '../../../config');
const CACHE_FILE = path.join(CONFIG_DIR, 'quality-profiles-cache.json');

interface QualityProfile {
  id: number;
  name: string;
}

interface CacheEntry {
  url: string;
  apiKey: string;
  profiles: QualityProfile[];
  lastFetched: string;
}

interface QualityProfilesCache {
  [key: string]: CacheEntry;
}

class QualityProfilesCacheService {
  private cache: QualityProfilesCache = {};

  async initialize(): Promise<void> {
    try {
      // Ensure config directory exists
      await fs.mkdir(CONFIG_DIR, { recursive: true });

      // Try to load existing cache
      try {
        await fs.access(CACHE_FILE);
        await this.loadCache();
        logger.debug('✅ Quality profiles cache loaded', { cacheFile: CACHE_FILE });
      } catch {
        // Cache doesn't exist, start with empty cache
        this.cache = {};
        await this.saveCache();
        logger.debug('✅ Quality profiles cache initialized (empty)', { cacheFile: CACHE_FILE });
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.warn('⚠️  Error initializing quality profiles cache', {
        error: errorMessage,
        cacheFile: CACHE_FILE
      });
      this.cache = {};
    }
  }

  private async loadCache(): Promise<void> {
    try {
      const content = await fs.readFile(CACHE_FILE, 'utf-8');
      this.cache = JSON.parse(content) as QualityProfilesCache;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('❌ Error loading quality profiles cache', {
        error: errorMessage,
        cacheFile: CACHE_FILE
      });
      this.cache = {};
    }
  }

  private async saveCache(): Promise<void> {
    try {
      await fs.writeFile(CACHE_FILE, JSON.stringify(this.cache, null, 2));
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('❌ Error saving quality profiles cache', {
        error: errorMessage,
        cacheFile: CACHE_FILE
      });
      throw error;
    }
  }

  getCacheKey(app: string, instanceId: string): string {
    return `${app}-${instanceId}`;
  }

  getCachedProfiles(app: string, instanceId: string, url: string, apiKey: string): QualityProfile[] | null {
    const key = this.getCacheKey(app, instanceId);
    const entry = this.cache[key];

    if (!entry) {
      return null;
    }

    // Validate that URL and API key match
    if (entry.url !== url || entry.apiKey !== apiKey) {
      // Cache entry is for different credentials, invalidate it
      delete this.cache[key];
      this.saveCache().catch((err: unknown) => {
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
        logger.error('Failed to save cache after invalidation', { error: errorMessage });
      });
      return null;
    }

    return entry.profiles;
  }

  async setCachedProfiles(
    app: string,
    instanceId: string,
    url: string,
    apiKey: string,
    profiles: QualityProfile[]
  ): Promise<void> {
    const key = this.getCacheKey(app, instanceId);
    this.cache[key] = {
      url,
      apiKey,
      profiles,
      lastFetched: new Date().toISOString()
    };
    await this.saveCache();
    logger.debug(`💾 Cached quality profiles for ${key}`, { count: profiles.length });
  }

  async invalidateCache(app: string, instanceId: string): Promise<void> {
    const key = this.getCacheKey(app, instanceId);
    if (this.cache[key]) {
      delete this.cache[key];
      await this.saveCache();
      logger.debug(`🗑️  Invalidated quality profiles cache for ${key}`);
    }
  }

  getAllCachedProfiles(): Record<string, QualityProfile[]> {
    const result: Record<string, QualityProfile[]> = {};
    for (const [key, entry] of Object.entries(this.cache)) {
      result[key] = entry.profiles;
    }
    return result;
  }

  async clearAllCache(): Promise<void> {
    this.cache = {};
    await this.saveCache();
    logger.info('🗑️  Cleared all quality profiles cache');
  }

}

export const qualityProfilesCacheService = new QualityProfilesCacheService();
