import express from 'express';
import { configService } from '../services/configService.js';
import { radarrService, RadarrMovie } from '../services/radarrService.js';
import { sonarrService, SonarrSeries } from '../services/sonarrService.js';
import { lidarrService, LidarrArtist } from '../services/lidarrService.js';
import { readarrService, ReadarrAuthor } from '../services/readarrService.js';
import { statsService } from '../services/statsService.js';
import { schedulerService } from '../services/schedulerService.js';
import { notificationService } from '../services/notificationService.js';
import logger from '../utils/logger.js';
import { getConfiguredInstances, getMediaTypeKey, APP_TYPES, AppType, extractItemsFromResult } from '../utils/starrUtils.js';
import { serviceRegistry, getServiceForApp } from '../utils/serviceRegistry.js';
import { RadarrInstance, SonarrInstance, LidarrInstance, ReadarrInstance } from '../types/config.js';
import { FilterableMedia } from '../utils/filterUtils.js';

export const searchRouter = express.Router();

// Type for instance configs
type StarrInstanceConfig = RadarrInstance | SonarrInstance | LidarrInstance | ReadarrInstance;

// Type for search results
interface SearchResult {
  success: boolean;
  searched: number;
  items: Array<{ id: number; title: string }>;
  error?: string;
}

interface SearchResults {
  [key: string]: SearchResult & {
    movies?: Array<{ id: number; title: string }>;
    series?: Array<{ id: number; title: string }>;
    artists?: Array<{ id: number; title: string }>;
    authors?: Array<{ id: number; title: string }>;
    instanceName?: string;
  };
}

// Helper function to randomly select items (matching script behavior)
function randomSelect<T>(items: T[], count: number | 'max'): T[] {
  if (count === 'max') {
    return items;
  }
  const numCount = count;
  if (numCount >= items.length) {
    return items;
  }
  if (items.length === 0) {
    return items;
  }
  // Shuffle and take first count items (simulating Get-Random behavior)
  const shuffled = [...items].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, numCount);
}

// Helper to generate result key for instances
export function getResultKey(instanceId: string, appType: AppType, instanceCount: number): string {
  return instanceCount > 1 ? instanceId : appType;
}

// Helper to extract instance info from config
export function getInstanceInfo(config: StarrInstanceConfig, appType: AppType): { instanceName: string; instanceId: string } {
  return {
    instanceName: config.name,
    instanceId: config.id || `${appType}-1`
  };
}

// Helper to save stats for results
export async function saveStatsForResults(results: SearchResults): Promise<void> {
  for (const [app, result] of Object.entries(results)) {
    if (result.success && result.searched && result.searched > 0) {
      // Extract app type from result key (could be "radarr" or "radarr-instance-id")
      const appType = app.split('-')[0] as AppType;
      
      // Get items - check all possible media type keys
      const items = extractItemsFromResult(result);
      
      // Use instanceName from result if available, otherwise undefined
      const instanceName = result.instanceName;
      
      // Debug logging to see what's being saved
      logger.debug('📊 Saving stats', {
        app,
        appType,
        instanceName,
        hasInstanceName: 'instanceName' in result,
        resultKeys: Object.keys(result),
        resultInstanceName: result.instanceName
      });
      
      await statsService.addUpgrade(
        appType,
        result.searched,
        items,
        instanceName
      );
    }
  }
}

// Helper to create processor config using service registry
function createProcessor<TConfig extends StarrInstanceConfig, TMedia extends FilterableMedia>(
  instanceName: string,
  config: TConfig,
  appType: AppType
): ApplicationProcessor<TMedia> {
  const service = getServiceForApp(appType);
  
  // Determine if search should be one-by-one based on app type
  const searchMediaOneByOne = appType === 'sonarr' || appType === 'lidarr' || appType === 'readarr';
  
  return {
    name: instanceName,
    config,
    getMedia: service.getMedia.bind(null, config) as (config: TConfig) => Promise<TMedia[]>,
    filterMedia: service.filterMedia.bind(null, config) as (config: TConfig, media: TMedia[]) => Promise<TMedia[]>,
    searchMedia: async (cfg: TConfig, mediaIds: number[]) => {
      if (appType === 'radarr') {
        await radarrService.searchMovies(cfg as RadarrInstance, mediaIds);
      } else if (appType === 'sonarr') {
        if (mediaIds.length > 0) {
          await sonarrService.searchSeries(cfg as SonarrInstance, mediaIds[0]);
        }
      } else if (appType === 'lidarr') {
        for (const artistId of mediaIds) {
          await lidarrService.searchArtists(cfg as LidarrInstance, artistId);
        }
      } else if (appType === 'readarr') {
        for (const authorId of mediaIds) {
          await readarrService.searchAuthors(cfg as ReadarrInstance, authorId);
        }
      }
    },
    searchMediaOneByOne,
    getTagId: service.getTagId.bind(null, config) as (config: TConfig, tagName: string) => Promise<number | null>,
    addTag: async (cfg: TConfig, mediaIds: number[], tagId: number) => {
      if (appType === 'radarr') {
        await radarrService.addTagToMovies(cfg as RadarrInstance, mediaIds, tagId);
      } else if (appType === 'sonarr') {
        await sonarrService.addTagToSeries(cfg as SonarrInstance, mediaIds, tagId);
      } else if (appType === 'lidarr') {
        await lidarrService.addTagToArtists(cfg as LidarrInstance, mediaIds, tagId);
      } else if (appType === 'readarr') {
        await readarrService.addTagToAuthors(cfg as ReadarrInstance, mediaIds, tagId);
      }
    },
    removeTag: async (cfg: TConfig, mediaIds: number[], tagId: number) => {
      if (appType === 'radarr') {
        await radarrService.removeTagFromMovies(cfg as RadarrInstance, mediaIds, tagId);
      } else if (appType === 'sonarr') {
        await sonarrService.removeTagFromSeries(cfg as SonarrInstance, mediaIds, tagId);
      } else if (appType === 'lidarr') {
        await lidarrService.removeTagFromArtists(cfg as LidarrInstance, mediaIds, tagId);
      } else if (appType === 'readarr') {
        await readarrService.removeTagFromAuthors(cfg as ReadarrInstance, mediaIds, tagId);
      }
    },
    getMediaId: service.getMediaId,
    getMediaTitle: service.getMediaTitle
  };
}

// Helper to process all instances of an app type
async function processAppInstances<T extends StarrInstanceConfig>(
  instances: T[],
  appType: AppType,
  results: SearchResults,
  unattended?: boolean
): Promise<void> {
  logger.debug(`📋 Processing ${instances.length} ${appType} instance(s)`, { 
    appType, 
    instanceCount: instances.length,
    unattended: unattended || false
  });
  
  for (let i = 0; i < instances.length; i++) {
    const instanceConfig = instances[i];
    const { instanceName, instanceId } = getInstanceInfo(instanceConfig, appType);
    logger.debug(`🔄 Processing instance ${i + 1}/${instances.length}`, { 
      instanceName, 
      instanceId, 
      appType 
    });
    
    // Merge unattended mode into config if provided
    const config = unattended !== undefined ? { ...instanceConfig, unattended } : instanceConfig;
    const processor = createProcessor(instanceName, config, appType);
    const result = await processApplication(processor);
    const resultKey = getResultKey(instanceId, appType, instances.length);
    results[resultKey] = {
      ...result,
      [getMediaTypeKey(appType)]: result.items,
      instanceName
    };
    
    logger.debug(`✅ Instance ${i + 1}/${instances.length} processed`, { 
      instanceName, 
      success: result.success, 
      searched: result.searched 
    });
  }
  
  logger.debug(`✅ All ${appType} instances processed`, { 
    appType, 
    instanceCount: instances.length,
    resultCount: Object.keys(results).length
  });
}

// Shared function to execute search run (used by both manual and scheduled runs)
export async function executeSearchRun(): Promise<SearchResults> {
  logger.info('🔍 Starting search run execution');
  const config = configService.getConfig();
  const results: SearchResults = {};
  
  // Use scheduler's unattended mode setting
  const unattended = config.scheduler?.unattended || false;
  logger.debug('⚙️  Search run configuration', { unattended });

  let totalInstancesProcessed = 0;
  let totalInstancesSkipped = 0;

  // Process all app types
  for (const appType of APP_TYPES) {
    logger.debug(`📋 Processing ${appType} instances`);
    // Get all configured instances, then filter out those with per-instance scheduling enabled
    // Global scheduler should only process instances without per-instance schedules
    const allInstances = getConfiguredInstances(config.applications[appType] as StarrInstanceConfig[]);
    const instances = allInstances.filter((instance: StarrInstanceConfig) => !instance.scheduleEnabled);
    
    logger.debug(`📊 ${appType} instance filtering`, { 
      total: allInstances.length, 
      afterFilter: instances.length,
      skipped: allInstances.length - instances.length
    });
    
    totalInstancesProcessed += instances.length;
    totalInstancesSkipped += (allInstances.length - instances.length);
    
    await processAppInstances(instances, appType, results, unattended);
  }

  logger.debug('📊 Search run summary', {
    totalInstancesProcessed,
    totalInstancesSkipped,
    resultCount: Object.keys(results).length
  });

  // Save stats for successful searches
  logger.debug('💾 Saving stats for search results');
  await saveStatsForResults(results);
  logger.debug('✅ Stats saved');

  logger.info('✅ Search run execution completed', {
    resultCount: Object.keys(results).length,
    totalSearched: Object.values(results).reduce((sum, r) => sum + (r.searched || 0), 0)
  });

  return results;
}

// Execute search run for a single instance
export async function executeSearchRunForInstance(appType: AppType, instanceId: string): Promise<SearchResults> {
  logger.info('🔍 Starting search run for single instance', { appType, instanceId });
  const config = configService.getConfig();
  const results: SearchResults = {};
  
  // Use scheduler's unattended mode setting (per-instance scheduling still uses global unattended mode)
  const unattended = config.scheduler?.unattended || false;
  logger.debug('⚙️  Instance search configuration', { unattended });

  // Get instances for the app type
  const instances = getConfiguredInstances(config.applications[appType] as StarrInstanceConfig[]);
  logger.debug(`📋 Found ${instances.length} configured ${appType} instances`);
  
  const instance = instances.find(inst => inst.id === instanceId);
  if (!instance) {
    logger.error('❌ Instance not found', { appType, instanceId, availableInstances: instances.map(i => i.id) });
    throw new Error(`Instance ${instanceId} not found for ${appType}`);
  }

  logger.debug('✅ Instance found, processing', { instanceName: instance.name || instanceId });
  // Process the single instance
  await processAppInstances([instance], appType, results, unattended);

  // Save stats for successful searches
  logger.debug('💾 Saving stats for instance search results');
  await saveStatsForResults(results);
  logger.debug('✅ Stats saved');

  logger.info('✅ Instance search run completed', {
    appType,
    instanceId,
    resultCount: Object.keys(results).length,
    totalSearched: Object.values(results).reduce((sum, r) => sum + (r.searched || 0), 0)
  });

  return results;
}

// Common interface for processing applications
interface ApplicationProcessor<TMedia extends FilterableMedia> {
  name: string;
  config: StarrInstanceConfig;
  getMedia: (config: StarrInstanceConfig) => Promise<TMedia[]>;
  filterMedia: (config: StarrInstanceConfig, media: TMedia[]) => Promise<TMedia[]>;
  searchMedia: (config: StarrInstanceConfig, mediaIds: number[]) => Promise<void>;
  searchMediaOneByOne: boolean;
  getTagId: (config: StarrInstanceConfig, tagName: string) => Promise<number | null>;
  addTag: (config: StarrInstanceConfig, mediaIds: number[], tagId: number) => Promise<void>;
  removeTag: (config: StarrInstanceConfig, mediaIds: number[], tagId: number) => Promise<void>;
  getMediaId: (media: TMedia) => number;
  getMediaTitle: (media: TMedia) => string;
}

// Generic function to process an application
export async function processApplication<TMedia extends FilterableMedia>(
  processor: ApplicationProcessor<TMedia>
): Promise<SearchResult> {
  try {
    logger.info(`Processing ${processor.name} search`, {
      count: processor.config.count,
      tagName: processor.config.tagName,
      unattended: processor.config.unattended
    });

    let allMedia = await processor.getMedia(processor.config);
    logger.debug(`📥 Fetched ${processor.name} media`, { total: allMedia.length });

    let filtered = await processor.filterMedia(processor.config, allMedia);
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
          return m.monitored === processor.config.monitored && Array.isArray(m.tags) && m.tags.includes(tagId);
        });
        if (mediaWithTag.length > 0) {
          const mediaIds = mediaWithTag.map(processor.getMediaId);
          await processor.removeTag(processor.config, mediaIds, tagId);
          logger.debug(`🏷️  Removed tag from ${processor.name}`, { count: mediaIds.length });

          // Re-fetch and re-filter
          allMedia = await processor.getMedia(processor.config);
          filtered = await processor.filterMedia(processor.config, allMedia);
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
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error(`❌ ${processor.name} search failed`, {
      error: errorMessage,
      stack: error instanceof Error ? error.stack : undefined
    });
    return {
      success: false,
      searched: 0,
      items: [],
      error: errorMessage
    };
  }
}

// Run search for all configured applications
searchRouter.post('/run', async (req, res) => {
  const startTime = Date.now();
  logger.info('🔍 Starting manual search operation');
  try {
    const results = await executeSearchRun();
    const duration = Date.now() - startTime;

    const summary = Object.keys(results).map(app => ({
      app,
      success: results[app].success,
      count: results[app].searched || 0
    }));
    
    logger.info('🎉 Search operation completed', {
      duration: `${duration}ms`,
      results: summary,
      totalSearched: summary.reduce((sum, r) => sum + r.count, 0),
      successCount: summary.filter(r => r.success).length,
      failureCount: summary.filter(r => !r.success).length
    });

    // Record this manual run in the scheduler history so it appears in the dashboard logs
    logger.debug('📝 Recording manual run in scheduler history');
    try {
      schedulerService.addToHistory({
        timestamp: new Date().toISOString(),
        results,
        success: true
      });
      logger.debug('✅ Manual run recorded in history');
    } catch (historyError: unknown) {
      const errorMessage = historyError instanceof Error ? historyError.message : 'Unknown error';
      logger.warn('⚠️  Failed to record manual run in scheduler history', {
        error: errorMessage
      });
    }

    // Send notifications
    logger.debug('📤 Sending notifications for manual run');
    try {
      await notificationService.sendNotifications(results, true);
      logger.debug('✅ Notifications sent for manual run');
    } catch (notificationError: unknown) {
      const errorMessage = notificationError instanceof Error ? notificationError.message : 'Unknown error';
      logger.warn('⚠️  Failed to send notifications for manual run', {
        error: errorMessage
      });
    }

    res.json(results);
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('❌ Search operation failed', {
      error: errorMessage,
      stack: error instanceof Error ? error.stack : undefined
    });

    // Record failed manual run in scheduler history
    try {
      schedulerService.addToHistory({
        timestamp: new Date().toISOString(),
        results: {},
        success: false,
        error: errorMessage
      });
    } catch (historyError: unknown) {
      const errorMessage = historyError instanceof Error ? historyError.message : 'Unknown error';
      logger.debug('Failed to record failed manual run in scheduler history', {
        error: errorMessage
      });
    }

    // Send failure notifications
    try {
      await notificationService.sendNotifications({}, false, errorMessage);
    } catch (notificationError: unknown) {
      const errorMessage = notificationError instanceof Error ? notificationError.message : 'Unknown error';
      logger.debug('Failed to send failure notifications', {
        error: errorMessage
      });
    }

    res.status(500).json({ error: errorMessage });
  }
});

// Helper function for manual run preview
async function processManualRun<TMedia extends FilterableMedia>(
  name: string,
  config: StarrInstanceConfig,
  getMedia: (config: StarrInstanceConfig) => Promise<TMedia[]>,
  filterMedia: (config: StarrInstanceConfig, media: TMedia[]) => Promise<TMedia[]>,
  getMediaId: (media: TMedia) => number,
  getMediaTitle: (media: TMedia) => string,
  getTagId?: (config: StarrInstanceConfig, tagName: string) => Promise<number | null>
): Promise<{ success: boolean; count: number; total: number; items: Array<{ id: number; title: string }>; error?: string }> {
  try {
    logger.debug(`Manual run preview: Processing ${name}`, {
      count: config.count,
      unattended: config.unattended
    });
    let media = await getMedia(config);
    let filtered = await filterMedia(config, media);

    // Unattended mode: if no media found, simulate tag removal and re-filter (preview only, no actual changes)
    if (config.unattended && filtered.length === 0 && getTagId) {
      logger.debug(`🔄 Unattended mode preview: No media found, simulating tag removal and re-filter for ${name}`);
      const tagId = await getTagId(config, config.tagName);
      if (tagId !== null) {
        // Simulate tag removal: create a copy of media with the tag removed from tags array
        const mediaWithTagRemoved = media.map(m => {
          // Check if this media item has the tag and matches monitored status
          if (m.monitored === config.monitored && Array.isArray(m.tags) && m.tags.includes(tagId)) {
            // Create a copy with the tag removed
            return {
              ...m,
              tags: m.tags.filter((t: number) => t !== tagId)
            } as TMedia;
          }
          return m;
        });
        
        // Re-filter with simulated tag removal to see what would be available after tag removal
        filtered = await filterMedia(config, mediaWithTagRemoved);
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
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error(`Manual run preview: ${name} failed`, { error: errorMessage });
    return {
      success: false,
      count: 0,
      total: 0,
      items: [],
      error: errorMessage
    };
  }
}

// Helper to process instances for manual run preview
async function processManualRunInstances(
  instances: StarrInstanceConfig[],
  appType: AppType,
  results: SearchResults
): Promise<void> {
  const service = getServiceForApp(appType);
  
  for (const instanceConfig of instances) {
    const { instanceName, instanceId } = getInstanceInfo(instanceConfig, appType);
    const result = await processManualRun(
      instanceName,
      instanceConfig,
      service.getMedia,
      service.filterMedia,
      service.getMediaId,
      service.getMediaTitle,
      service.getTagId,
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
    const results: SearchResults = {};

    // Process all app types
    for (const appType of APP_TYPES) {
      const instances = getConfiguredInstances(config.applications[appType] as StarrInstanceConfig[]);
      await processManualRunInstances(instances, appType, results);
    }

    logger.info('✅ Manual run preview completed');
    res.json(results);
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('❌ Manual run preview failed', {
      error: errorMessage,
      stack: error instanceof Error ? error.stack : undefined
    });
    res.status(500).json({ error: errorMessage });
  }
});
