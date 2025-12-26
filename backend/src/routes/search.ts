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
import { StarrInstanceConfig } from '../types/starr.js';
import { SearchResults, SearchResult } from '../types/api.js';
import { FilterableMedia } from '../utils/filterUtils.js';
import { getErrorMessage } from '../utils/errorUtils.js';

export const searchRouter = express.Router();

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
function getResultKey(instanceId: string, appType: AppType, instanceCount: number): string {
  return instanceCount > 1 ? instanceId : appType;
}

// Helper to extract instance info from config
function getInstanceInfo(config: StarrInstanceConfig, appType: AppType): { instanceName: string; instanceId: string } {
  return {
    instanceName: config.name,
    instanceId: config.id || `${appType}-1`
  };
}

// Helper to save stats for results
async function saveStatsForResults(results: SearchResults): Promise<void> {
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
  appType: AppType,
  instanceId: string,
  unattended?: boolean
): ApplicationProcessor<TMedia> {
  const service = getServiceForApp(appType);
  
  // Determine if search should be one-by-one based on app type
  const searchMediaOneByOne = appType === 'sonarr' || appType === 'lidarr' || appType === 'readarr';
  
  return {
    name: instanceName,
    config,
    appType,
    instanceId,
    unattended,
    getMedia: (cfg: TConfig) => service.getMedia(cfg),
    filterMedia: (cfg: TConfig, media: TMedia[]) => service.filterMedia(cfg, media),
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
    getTagId: (cfg: TConfig, tagName: string) => service.getTagId(cfg, tagName),
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
  for (let i = 0; i < instances.length; i++) {
    const instanceConfig = instances[i];
    const { instanceName, instanceId } = getInstanceInfo(instanceConfig, appType);
    
      const processor = createProcessor(instanceName, instanceConfig, appType, instanceId, unattended);
      const result = await processApplication(processor);
    const resultKey = getResultKey(instanceId, appType, instances.length);
    results[resultKey] = {
      ...result,
      [getMediaTypeKey(appType)]: result.items,
      instanceName
    };
  }
}

// Shared function to execute search run (used by both manual and scheduled runs)
export async function executeSearchRun(): Promise<SearchResults> {
  logger.info('🔍 Starting search run execution');
  const config = configService.getConfig();
  const results: SearchResults = {};
  
  // Use scheduler's unattended mode setting
  const unattended = config.scheduler?.unattended || false;

  // Process all app types
  for (const appType of APP_TYPES) {
    // Get all configured instances, then filter out those with per-instance scheduling enabled
    // Global scheduler should only process instances without per-instance schedules
    const allInstances = getConfiguredInstances(config.applications[appType] as StarrInstanceConfig[]);
    const instances = allInstances.filter((instance: StarrInstanceConfig) => !instance.scheduleEnabled);
    
    await processAppInstances(instances, appType, results, unattended);
  }

  // Save stats for successful searches
  await saveStatsForResults(results);

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
  appType: AppType;
  instanceId: string;
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
      unattended: processor.unattended
    });

    let allMedia = await processor.getMedia(processor.config);
    let filtered = await processor.filterMedia(processor.config, allMedia);

    // Unattended mode: if no media found, remove tag from all and re-filter
    if (processor.unattended && filtered.length === 0) {
      logger.info(`🔄 Unattended mode: No media found, removing tag from all ${processor.name} and re-filtering`);
      const tagId = await processor.getTagId(processor.config, processor.config.tagName);
      if (tagId !== null) {
        const mediaWithTag = allMedia.filter(m => {
          return m.monitored === processor.config.monitored && Array.isArray(m.tags) && m.tags.includes(tagId);
        });
        if (mediaWithTag.length > 0) {
          const mediaIds = mediaWithTag.map(processor.getMediaId);
          await processor.removeTag(processor.config, mediaIds, tagId);

          // Re-fetch and re-filter
          allMedia = await processor.getMedia(processor.config);
          filtered = await processor.filterMedia(processor.config, allMedia);
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

    // Search media
    const mediaIds = toSearch.map(processor.getMediaId);
    if (processor.searchMediaOneByOne) {
      // Search one at a time (Sonarr/Lidarr/Readarr)
      for (const media of toSearch) {
        await processor.searchMedia(processor.config, [processor.getMediaId(media)]);
      }
    } else {
      // Search all at once (Radarr)
      await processor.searchMedia(processor.config, mediaIds);
    }

    // Add tag using editor endpoint
    const tagId = await processor.getTagId(processor.config, processor.config.tagName);
    if (tagId !== null && mediaIds.length > 0) {
      await processor.addTag(processor.config, mediaIds, tagId);
      // Record tagged media in database so we can track which tags were added by this app
      await statsService.addTaggedMedia(processor.appType, processor.instanceId, tagId, mediaIds);
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
    const errorMessage = getErrorMessage(error);
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

    // Record this run in the scheduler history so it appears in the dashboard logs
    logger.debug('📝 Recording run in scheduler history');
    try {
      schedulerService.addToHistory({
        timestamp: new Date().toISOString(),
        results,
        success: true
      });
    } catch (historyError: unknown) {
      logger.warn('⚠️  Failed to record run in scheduler history', {
        error: getErrorMessage(historyError)
      });
    }

    // Send notifications
    logger.debug('📤 Sending notifications for run');
    try {
      await notificationService.sendNotifications(results, true);
    } catch (notificationError: unknown) {
      logger.warn('⚠️  Failed to send notifications', {
        error: getErrorMessage(notificationError)
      });
    }

    res.json(results);
  } catch (error: unknown) {
    const errorMessage = getErrorMessage(error);
    logger.error('❌ Search operation failed', {
      error: errorMessage,
      stack: error instanceof Error ? error.stack : undefined
    });

    // Record failed run in scheduler history
    try {
      schedulerService.addToHistory({
        timestamp: new Date().toISOString(),
        results: {},
        success: false,
        error: errorMessage
      });
    } catch (historyError: unknown) {
      logger.warn('⚠️  Failed to record failed run in scheduler history', {
        error: getErrorMessage(historyError)
      });
    }

    // Send failure notifications
    try {
      await notificationService.sendNotifications({}, false, errorMessage);
    } catch (notificationError: unknown) {
      logger.warn('⚠️  Failed to send failure notifications', {
        error: getErrorMessage(notificationError)
      });
    }

    res.status(500).json({
      error: 'Search operation failed',
      message: errorMessage
    });
  }
});

// Helper function for run preview
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
    logger.debug(`Run preview: Processing ${name}`, {
      count: config.count,
      unattended: config.unattended
    });
    let media = await getMedia(config);
    let filtered = await filterMedia(config, media);

    // Unattended mode: if no media found, simulate tag removal and re-filter (preview only, no actual changes)
    if (config.unattended && filtered.length === 0 && getTagId) {
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
      }
    }

    const toSearch = randomSelect(filtered, config.count);

    return {
      success: true,
      count: toSearch.length,
      total: filtered.length,
      items: toSearch.map(m => ({ id: getMediaId(m), title: getMediaTitle(m) }))
    };
  } catch (error: unknown) {
    const errorMessage = getErrorMessage(error);
    logger.error(`Run preview: ${name} failed`, { error: errorMessage });
    return {
      success: false,
      count: 0,
      total: 0,
      items: [],
      error: errorMessage
    };
  }
}

// Helper to process instances for run preview
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

// Get items that would be searched (run preview)
// Get cached run preview from database
searchRouter.get('/run-preview', async (req, res) => {
  logger.debug('📖 Retrieving cached run preview from database');
  try {
    const preview = await statsService.getRunPreview();
    if (preview) {
      logger.debug('✅ Cached run preview found');
      res.json(preview);
    } else {
      logger.debug('ℹ️  No cached run preview found');
      res.json({}); // Return 200 with empty object instead of 404
    }
  } catch (error: unknown) {
    const errorMessage = getErrorMessage(error);
    logger.error('❌ Failed to get run preview from database', {
      error: errorMessage
    });
    res.status(500).json({
      error: 'Failed to get run preview',
      message: errorMessage
    });
  }
});

searchRouter.post('/run-preview', async (req, res) => {
  logger.info('👀 Starting run preview');
  try {
    const config = configService.getConfig();
    const results: SearchResults = {};

    // Process all app types
    for (const appType of APP_TYPES) {
      const instances = getConfiguredInstances(config.applications[appType] as StarrInstanceConfig[]);
      await processManualRunInstances(instances, appType, results);
    }

    // Save preview to database
    try {
      await statsService.saveRunPreview(results);
    } catch (dbError: unknown) {
      logger.warn('⚠️  Failed to save run preview to database', {
        error: getErrorMessage(dbError)
      });
      // Continue even if DB save fails
    }

    logger.info('✅ Run Preview');
    res.json(results);
  } catch (error: unknown) {
    const errorMessage = getErrorMessage(error);
    logger.error('❌ Run preview failed', {
      error: errorMessage,
      stack: error instanceof Error ? error.stack : undefined
    });
    res.status(500).json({
      error: 'Run preview failed',
      message: errorMessage
    });
  }
});
