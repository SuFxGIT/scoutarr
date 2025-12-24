import express from 'express';
import { configService } from '../services/configService.js';
import { radarrService } from '../services/radarrService.js';
import { sonarrService } from '../services/sonarrService.js';
import { lidarrService } from '../services/lidarrService.js';
import { readarrService } from '../services/readarrService.js';
import { statsService } from '../services/statsService.js';
import { schedulerService } from '../services/schedulerService.js';
import logger from '../utils/logger.js';
import { getConfiguredInstances, getMediaTypeKey, APP_TYPES } from '../utils/starrUtils.js';

export const searchRouter = express.Router();

// Helper function to randomly select items (matching script behavior)
function randomSelect<T>(items: T[], count: number | 'max' | 'MAX'): T[] {
  if (count === 'max' || count === 'MAX') {
    return items;
  }
  if (typeof count === 'number' && count >= items.length) {
    return items;
  }
  if (items.length === 0) {
    return items;
  }
  // Shuffle and take first count items (simulating Get-Random behavior)
  const shuffled = [...items].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

// Helper to generate result key for instances
export function getResultKey(instanceId: string, appType: string, instanceCount: number): string {
  return instanceCount > 1 ? instanceId : appType;
}

// Helper to extract instance info from config
export function getInstanceInfo(config: any, appType: string): { instanceName: string; instanceId: string } {
  return {
    instanceName: config.name || appType,
    instanceId: config.id || `${appType}-1`
  };
}

// Helper to save stats for results
export async function saveStatsForResults(results: Record<string, any>): Promise<void> {
  
  for (const [app, result] of Object.entries(results)) {
    if (result.success && result.searched && result.searched > 0) {
      // Extract app type from result key (could be "radarr" or "radarr-instance-id")
      const appType = app.split('-')[0];
      
      // Get items - check all possible media type keys
      const items = result.movies || result.series || result.artists || result.authors || result.items || [];
      
      // Instance key is the full app key if it contains a dash (instance ID) and is a valid app type
      const instanceKey = app.includes('-') && APP_TYPES.includes(appType as any) ? app : undefined;
      
      await statsService.addUpgrade(
        appType,
        result.searched,
        items,
        instanceKey
      );
    }
  }
}

// Helper to create Radarr processor config
export function createRadarrProcessor(instanceName: string, config: any) {
  return {
    name: instanceName,
    config,
    getMedia: radarrService.getMovies.bind(radarrService),
    filterMedia: radarrService.filterMovies.bind(radarrService),
    searchMedia: radarrService.searchMovies.bind(radarrService),
    searchMediaOneByOne: false,
    getTagId: radarrService.getTagId.bind(radarrService),
    addTag: radarrService.addTagToMovies.bind(radarrService),
    removeTag: radarrService.removeTagFromMovies.bind(radarrService),
    getMediaId: (m: any) => m.id,
    getMediaTitle: (m: any) => m.title
  };
}

// Helper to create Sonarr processor config
export function createSonarrProcessor(instanceName: string, config: any) {
  return {
    name: instanceName,
    config,
    getMedia: sonarrService.getSeries.bind(sonarrService),
    filterMedia: sonarrService.filterSeries.bind(sonarrService),
    searchMedia: async (cfg: any, seriesIds: number[]) => {
      if (seriesIds.length > 0) {
        await sonarrService.searchSeries(cfg, seriesIds[0]);
      }
    },
    searchMediaOneByOne: true,
    getTagId: sonarrService.getTagId.bind(sonarrService),
    addTag: sonarrService.addTagToSeries.bind(sonarrService),
    removeTag: sonarrService.removeTagFromSeries.bind(sonarrService),
    getMediaId: (s: any) => s.id,
    getMediaTitle: (s: any) => s.title
  };
}

// Helper to create Lidarr processor config
export function createLidarrProcessor(instanceName: string, config: any) {
  return {
    name: instanceName,
    config,
    getMedia: lidarrService.getArtists.bind(lidarrService),
    filterMedia: lidarrService.filterArtists.bind(lidarrService),
    searchMedia: async (cfg: any, artistIds: number[]) => {
      // Lidarr only supports searching one artist at a time
      for (const artistId of artistIds) {
        await lidarrService.searchArtists(cfg, artistId);
      }
    },
    searchMediaOneByOne: true,
    getTagId: lidarrService.getTagId.bind(lidarrService),
    addTag: lidarrService.addTagToArtists.bind(lidarrService),
    removeTag: lidarrService.removeTagFromArtists.bind(lidarrService),
    getMediaId: (a: any) => a.id,
    getMediaTitle: (a: any) => a.title || a.artistName
  };
}

// Helper to create Readarr processor config
export function createReadarrProcessor(instanceName: string, config: any) {
  return {
    name: instanceName,
    config,
    getMedia: readarrService.getAuthors.bind(readarrService),
    filterMedia: readarrService.filterAuthors.bind(readarrService),
    searchMedia: async (cfg: any, authorIds: number[]) => {
      // Readarr only supports searching one author at a time
      for (const authorId of authorIds) {
        await readarrService.searchAuthors(cfg, authorId);
      }
    },
    searchMediaOneByOne: true,
    getTagId: readarrService.getTagId.bind(readarrService),
    addTag: readarrService.addTagToAuthors.bind(readarrService),
    removeTag: readarrService.removeTagFromAuthors.bind(readarrService),
    getMediaId: (a: any) => a.id,
    getMediaTitle: (a: any) => a.title || a.authorName
  };
}

// Helper to process all instances of an app type
async function processAppInstances<T>(
  instances: T[],
  appType: 'radarr' | 'sonarr' | 'lidarr' | 'readarr',
  createProcessor: (instanceName: string, config: any) => ApplicationProcessor<any>,
  results: Record<string, any>,
  unattended?: boolean
): Promise<void> {
  for (const instanceConfig of instances) {
    const { instanceName, instanceId } = getInstanceInfo(instanceConfig as any, appType);
    const config = unattended !== undefined ? { ...instanceConfig, unattended } : instanceConfig;
    const processor = createProcessor(instanceName, config);
    const result = await processApplication(processor);
    const resultKey = getResultKey(instanceId, appType, instances.length);
    results[resultKey] = {
      ...result,
      [getMediaTypeKey(appType)]: result.items,
      instanceName
    };
  }
}

// Helper to get processor creator and instances for an app type
function getProcessorAndInstances(appType: 'radarr' | 'sonarr' | 'lidarr' | 'readarr'): {
  instances: any[];
  processor: (instanceName: string, config: any) => ApplicationProcessor<any>;
} {
  const config = configService.getConfig();
  
  if (appType === 'radarr') {
    return {
      instances: getConfiguredInstances(config.applications.radarr),
      processor: createRadarrProcessor
    };
  } else if (appType === 'sonarr') {
    return {
      instances: getConfiguredInstances(config.applications.sonarr),
      processor: createSonarrProcessor
    };
  } else if (appType === 'lidarr') {
    return {
      instances: getConfiguredInstances(config.applications.lidarr),
      processor: createLidarrProcessor
    };
  } else if (appType === 'readarr') {
    return {
      instances: getConfiguredInstances(config.applications.readarr),
      processor: createReadarrProcessor
    };
  } else {
    throw new Error(`Unknown app type: ${appType}`);
  }
}

// Shared function to execute search run (used by both manual and scheduled runs)
export async function executeSearchRun(): Promise<Record<string, any>> {
  const config = configService.getConfig();
  const results: Record<string, any> = {};
  
  // Use scheduler's unattended mode setting
  const unattended = config.scheduler?.unattended || false;

  // Process Radarr
  const radarrInstances = getConfiguredInstances(config.applications.radarr);
  await processAppInstances(radarrInstances, 'radarr', createRadarrProcessor, results, unattended);

  // Process Sonarr
  const sonarrInstances = getConfiguredInstances(config.applications.sonarr);
  await processAppInstances(sonarrInstances, 'sonarr', createSonarrProcessor, results, unattended);

  // Process Lidarr
  const lidarrInstances = getConfiguredInstances(config.applications.lidarr);
  await processAppInstances(lidarrInstances, 'lidarr', createLidarrProcessor, results, unattended);

  // Process Readarr
  const readarrInstances = getConfiguredInstances(config.applications.readarr);
  await processAppInstances(readarrInstances, 'readarr', createReadarrProcessor, results, unattended);

  // Save stats for successful searches
  await saveStatsForResults(results);

  return results;
}

// Execute search run for a single instance
export async function executeSearchRunForInstance(appType: 'radarr' | 'sonarr' | 'lidarr' | 'readarr', instanceId: string): Promise<Record<string, any>> {
  const config = configService.getConfig();
  const results: Record<string, any> = {};
  
  // Use scheduler's unattended mode setting (per-instance scheduling still uses global unattended mode)
  const unattended = config.scheduler?.unattended || false;

  // Get processor and instances for the app type
  const { instances, processor } = getProcessorAndInstances(appType);
  
  const instance = instances.find(inst => inst.id === instanceId);
  if (!instance) {
    throw new Error(`Instance ${instanceId} not found for ${appType}`);
  }

  // Process the single instance
  await processAppInstances([instance], appType, processor, results, unattended);

  // Save stats for successful searches
  await saveStatsForResults(results);

  return results;
}

// Common interface for processing applications
interface ApplicationProcessor<TMedia> {
  name: string;
  config: any;
  getMedia: (config: any) => Promise<TMedia[]>;
  filterMedia: (config: any, media: TMedia[], unattended: boolean) => Promise<TMedia[]>;
  searchMedia: (config: any, mediaIds: number[]) => Promise<void>;
  searchMediaOneByOne: boolean;
  getTagId: (config: any, tagName: string) => Promise<number | null>;
  addTag: (config: any, mediaIds: number[], tagId: number) => Promise<void>;
  removeTag: (config: any, mediaIds: number[], tagId: number) => Promise<void>;
  getMediaId: (media: TMedia) => number;
  getMediaTitle: (media: TMedia) => string;
}

// Generic function to process an application
export async function processApplication<TMedia>(
  processor: ApplicationProcessor<TMedia>
): Promise<{ success: boolean; searched: number; items: Array<{ id: number; title: string }>; error?: string }> {
  try {
    logger.info(`Processing ${processor.name} search`, {
      count: processor.config.count,
      tagName: processor.config.tagName,
      unattended: processor.config.unattended
    });

    let allMedia = await processor.getMedia(processor.config);
    logger.debug(`📥 Fetched ${processor.name} media`, { total: allMedia.length });

    let filtered = await processor.filterMedia(processor.config, allMedia, processor.config.unattended);
    logger.debug(`🔽 Filtered ${processor.name} media`, {
      total: allMedia.length,
      filtered: filtered.length,
      unattended: processor.config.unattended
    });

    // Unattended mode: if no media found, remove tag from all and re-filter
    if (processor.config.unattended && filtered.length === 0) {
      logger.info(`🔄 Unattended mode: No media found, removing tag from all ${processor.name} and re-filtering`);
      const tagId = await processor.getTagId(processor.config, processor.config.tagName);
      if (tagId !== null) {
        const mediaWithTag = allMedia.filter(m => {
          const mediaAny = m as any;
          return mediaAny.monitored === processor.config.monitored && Array.isArray(mediaAny.tags) && mediaAny.tags.includes(tagId);
        });
        if (mediaWithTag.length > 0) {
          const mediaIds = mediaWithTag.map(processor.getMediaId);
          await processor.removeTag(processor.config, mediaIds, tagId);
          logger.debug(`🏷️  Removed tag from ${processor.name}`, { count: mediaIds.length });

          // Re-fetch and re-filter
          allMedia = await processor.getMedia(processor.config);
          filtered = await processor.filterMedia(processor.config, allMedia, false);
          logger.debug(`🔄 Re-filtered ${processor.name} after tag removal`, {
            total: allMedia.length,
            filtered: filtered.length
          });
        }
      }
    }

    if (filtered.length === 0) {
      logger.warn(`⚠️  No ${processor.name} found matching criteria`);
      return {
        success: true,
        searched: 0,
        items: []
      };
    }

    // Select random media based on count
    const toSearch = randomSelect(filtered, processor.config.count);
    logger.debug(`🎲 Selected ${processor.name} to search`, {
      selected: toSearch.length,
      available: filtered.length,
      count: processor.config.count
    });

    // Search media
    const mediaIds = toSearch.map(processor.getMediaId);
    if (processor.searchMediaOneByOne) {
      // Search one at a time (Sonarr/Lidarr/Readarr)
      for (const media of toSearch) {
        logger.debug(`🔎 Searching ${processor.name}`, {
          id: processor.getMediaId(media),
          title: processor.getMediaTitle(media)
        });
        await processor.searchMedia(processor.config, [processor.getMediaId(media)]);
      }
    } else {
      // Search all at once (Radarr)
      await processor.searchMedia(processor.config, mediaIds);
      logger.debug(`🔎 Triggered search for ${processor.name}`, { mediaIds, count: mediaIds.length });
    }

    // Add tag using editor endpoint
    const tagId = await processor.getTagId(processor.config, processor.config.tagName);
    if (tagId !== null && mediaIds.length > 0) {
      await processor.addTag(processor.config, mediaIds, tagId);
      logger.debug(`🏷️  Tagged ${processor.name}`, { mediaIds, tagId, count: mediaIds.length });
    }

    const items = toSearch.map(m => ({
      id: processor.getMediaId(m),
      title: processor.getMediaTitle(m)
    }));

    logger.info(`✅ ${processor.name} search completed`, {
      searched: toSearch.length,
      items: toSearch.map(processor.getMediaTitle)
    });

    return {
      success: true,
      searched: toSearch.length,
      items
    };
  } catch (error: any) {
    logger.error(`❌ ${processor.name} search failed`, {
      error: error.message,
      stack: error.stack
    });
    return {
      success: false,
      searched: 0,
      items: [],
      error: error.message
    };
  }
}

// Run search for all configured applications
searchRouter.post('/run', async (req, res) => {
  logger.info('🔍 Starting search operation');
  try {
    const results = await executeSearchRun();

    logger.info('🎉 Search operation completed', {
      results: Object.keys(results).map(app => ({
        app,
        success: results[app].success,
        count: results[app].searched || 0
      }))
    });

    // Record this manual run in the scheduler history so it appears in the dashboard logs
    try {
      schedulerService.addToHistory({
        timestamp: new Date().toISOString(),
        results,
        success: true
      });
    } catch (historyError: any) {
      logger.debug('Failed to record manual run in scheduler history', {
        error: historyError.message
      });
    }

    res.json(results);
  } catch (error: any) {
    logger.error('❌ Search operation failed', {
      error: error.message,
      stack: error.stack
    });

    // Record failed manual run in scheduler history
    try {
      schedulerService.addToHistory({
        timestamp: new Date().toISOString(),
        results: {},
        success: false,
        error: error.message
      } as any);
    } catch (historyError: any) {
      logger.debug('Failed to record failed manual run in scheduler history', {
        error: historyError.message
      });
    }
    res.status(500).json({ error: error.message });
  }
});

// Helper function for manual run preview
async function processManualRun<TMedia>(
  name: string,
  config: any,
  getMedia: (config: any) => Promise<TMedia[]>,
  filterMedia: (config: any, media: TMedia[], unattended: boolean) => Promise<TMedia[]>,
  getMediaId: (media: TMedia) => number,
  getMediaTitle: (media: TMedia) => string,
  getTagId?: (config: any, tagName: string) => Promise<number | null>
): Promise<{ success: boolean; count: number; total: number; items: Array<{ id: number; title: string }>; error?: string }> {
  try {
    logger.debug(`Manual run preview: Processing ${name}`, {
      count: config.count,
      unattended: config.unattended
    });
    let media = await getMedia(config);
    let filtered = await filterMedia(config, media, config.unattended);

    // Unattended mode: if no media found, simulate tag removal and re-filter (preview only, no actual changes)
    if (config.unattended && filtered.length === 0 && getTagId) {
      logger.debug(`🔄 Unattended mode preview: No media found, simulating tag removal and re-filter for ${name}`);
      const tagId = await getTagId(config, config.tagName);
      if (tagId !== null) {
        // Simulate tag removal: create a copy of media with the tag removed from tags array
        const mediaWithTagRemoved = media.map(m => {
          const mediaAny = m as any;
          // Check if this media item has the tag and matches monitored status
          if (mediaAny.monitored === config.monitored && Array.isArray(mediaAny.tags) && mediaAny.tags.includes(tagId)) {
            // Create a copy with the tag removed
            return {
              ...m,
              tags: mediaAny.tags.filter((t: number) => t !== tagId)
            };
          }
          return m;
        });
        
        // Re-filter without unattended mode to see what would be available after tag removal
        filtered = await filterMedia(config, mediaWithTagRemoved, false);
        logger.debug(`🔄 Simulated re-filter for ${name} after tag removal`, {
          total: media.length,
          filtered: filtered.length
        });
      }
    }

    const toSearch = randomSelect(filtered, config.count);

    logger.debug(`Manual run preview: ${name} results`, {
      total: media.length,
      filtered: filtered.length,
      toSearch: toSearch.length
    });

    return {
      success: true,
      count: toSearch.length,
      total: filtered.length,
      items: toSearch.map(m => ({ id: getMediaId(m), title: getMediaTitle(m) }))
    };
  } catch (error: any) {
    logger.error(`Manual run preview: ${name} failed`, { error: error.message });
    return {
      success: false,
      count: 0,
      total: 0,
      items: [],
      error: error.message
    };
  }
}

// Helper to process instances for manual run preview
async function processManualRunInstances(
  instances: any[],
  appType: 'radarr' | 'sonarr' | 'lidarr' | 'readarr',
  getMedia: (config: any) => Promise<any[]>,
  filterMedia: (config: any, media: any[], unattended: boolean) => Promise<any[]>,
  getMediaId: (media: any) => number,
  getMediaTitle: (media: any) => string,
  getTagId: (config: any, tagName: string) => Promise<number | null>,
  results: Record<string, any>
): Promise<void> {
  for (const instanceConfig of instances) {
    const { instanceName, instanceId } = getInstanceInfo(instanceConfig, appType);
    const result = await processManualRun(
      instanceName,
      instanceConfig,
      getMedia,
      filterMedia,
      getMediaId,
      getMediaTitle,
      getTagId
    );
    const resultKey = getResultKey(instanceId, appType, instances.length);
    results[resultKey] = {
      ...result,
      [getMediaTypeKey(appType)]: result.items,
      instanceName
    };
  }
}

// Get items that would be searched (manual run preview)
searchRouter.post('/manual-run', async (req, res) => {
  logger.info('👀 Starting manual run preview');
  try {
    const config = configService.getConfig();
    const results: Record<string, any> = {};

    // Process Radarr
    const radarrInstances = getConfiguredInstances(config.applications.radarr);
    await processManualRunInstances(
      radarrInstances,
      'radarr',
      radarrService.getMovies.bind(radarrService),
      radarrService.filterMovies.bind(radarrService),
      (m) => m.id,
      (m) => m.title,
      radarrService.getTagId.bind(radarrService),
      results
    );

    // Process Sonarr
    const sonarrInstances = getConfiguredInstances(config.applications.sonarr);
    await processManualRunInstances(
      sonarrInstances,
      'sonarr',
      sonarrService.getSeries.bind(sonarrService),
      sonarrService.filterSeries.bind(sonarrService),
      (s) => s.id,
      (s) => s.title,
      sonarrService.getTagId.bind(sonarrService),
      results
    );

    // Process Lidarr
    const lidarrInstances = getConfiguredInstances(config.applications.lidarr);
    await processManualRunInstances(
      lidarrInstances,
      'lidarr',
      lidarrService.getArtists.bind(lidarrService),
      lidarrService.filterArtists.bind(lidarrService),
      (a) => a.id,
      (a) => a.title || a.artistName,
      lidarrService.getTagId.bind(lidarrService),
      results
    );

    // Process Readarr
    const readarrInstances = getConfiguredInstances(config.applications.readarr);
    await processManualRunInstances(
      readarrInstances,
      'readarr',
      readarrService.getAuthors.bind(readarrService),
      readarrService.filterAuthors.bind(readarrService),
      (a) => a.id,
      (a) => a.title || a.authorName,
      readarrService.getTagId.bind(readarrService),
      results
    );

    logger.info('✅ Manual run preview completed');
    res.json(results);
  } catch (error: any) {
    logger.error('❌ Manual run preview failed', {
      error: error.message,
      stack: error.stack
    });
    res.status(500).json({ error: error.message });
  }
});

