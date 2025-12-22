import express from 'express';
import { configService } from '../services/configService.js';
import { radarrService } from '../services/radarrService.js';
import { sonarrService } from '../services/sonarrService.js';
import { statsService } from '../services/statsService.js';
import logger from '../utils/logger.js';
import { getConfiguredInstances } from '../utils/starrUtils.js';

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
        const mediaWithTag = allMedia.filter(
          m => m.monitored === processor.config.monitored && m.tags.includes(tagId)
        );
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
    const config = configService.getConfig();
    const results: Record<string, any> = {};

    // Process Radarr
    const radarrInstances = getConfiguredInstances(config.applications.radarr);
    
    for (const radarrConfig of radarrInstances) {
      const instanceName = (radarrConfig as any).name || 'Radarr';
      const instanceId = (radarrConfig as any).id || 'radarr-1';
      const result = await processApplication({
        name: instanceName,
        config: radarrConfig,
        getMedia: radarrService.getMovies.bind(radarrService),
        filterMedia: radarrService.filterMovies.bind(radarrService),
        searchMedia: radarrService.searchMovies.bind(radarrService),
        searchMediaOneByOne: false,
        getTagId: radarrService.getTagId.bind(radarrService),
        addTag: radarrService.addTagToMovies.bind(radarrService),
        removeTag: radarrService.removeTagFromMovies.bind(radarrService),
        getMediaId: (m) => m.id,
        getMediaTitle: (m) => m.title
      });
      const resultKey = radarrInstances.length > 1 ? `${instanceId}` : 'radarr';
      results[resultKey] = {
        ...result,
        movies: result.items,
        instanceName
      };
    }

    // Process Sonarr
    const sonarrInstances = getConfiguredInstances(config.applications.sonarr);
    
    for (const sonarrConfig of sonarrInstances) {
      const instanceName = (sonarrConfig as any).name || 'Sonarr';
      const instanceId = (sonarrConfig as any).id || 'sonarr-1';
      const result = await processApplication({
        name: instanceName,
        config: sonarrConfig,
        getMedia: sonarrService.getSeries.bind(sonarrService),
        filterMedia: sonarrService.filterSeries.bind(sonarrService),
        searchMedia: async (cfg, seriesIds) => {
          // Sonarr only supports one at a time - this is called per-item in processApplication
          if (seriesIds.length > 0) {
            await sonarrService.searchSeries(cfg, seriesIds[0]);
          }
        },
        searchMediaOneByOne: true,
        getTagId: sonarrService.getTagId.bind(sonarrService),
        addTag: sonarrService.addTagToSeries.bind(sonarrService),
        removeTag: sonarrService.removeTagFromSeries.bind(sonarrService),
        getMediaId: (s) => s.id,
        getMediaTitle: (s) => s.title
      });
      const resultKey = sonarrInstances.length > 1 ? `${instanceId}` : 'sonarr';
      results[resultKey] = {
        ...result,
        series: result.items,
        instanceName
      };
    }

    logger.info('🎉 Search operation completed', {
      results: Object.keys(results).map(app => ({
        app,
        success: results[app].success,
        count: results[app].searched || 0
      }))
    });

    // Save stats for successful searches
    for (const [app, result] of Object.entries(results)) {
      if (result.success && result.searched && result.searched > 0) {
        const items = result.movies || result.series || result.items || [];
        const instanceName = result.instanceName;
        // Extract instance ID from key if it's an instance-specific key
        const instanceId = app.includes('-') && app !== 'radarr' && app !== 'sonarr' ? app.split('-').slice(1).join('-') : undefined;
        await statsService.addUpgrade(
          instanceName || app, 
          result.searched, 
          items,
          instanceId || instanceName
        );
      }
    }

    res.json(results);
  } catch (error: any) {
    logger.error('❌ Search operation failed', {
      error: error.message,
      stack: error.stack
    });
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
  getMediaTitle: (media: TMedia) => string
): Promise<{ success: boolean; count: number; total: number; items: Array<{ id: number; title: string }>; error?: string }> {
  try {
    logger.debug(`Manual run preview: Processing ${name}`, {
      count: config.count,
      unattended: config.unattended
    });
    const media = await getMedia(config);
    const filtered = await filterMedia(config, media, config.unattended);
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

// Get items that would be searched (manual run preview)
searchRouter.post('/manual-run', async (req, res) => {
  logger.info('👀 Starting manual run preview');
  try {
    const config = configService.getConfig();
    const results: Record<string, any> = {};

    // Process Radarr
    const radarrInstances = getConfiguredInstances(config.applications.radarr);
    
    for (const radarrConfig of radarrInstances) {
      const instanceName = (radarrConfig as any).name || 'Radarr';
      const instanceId = (radarrConfig as any).id || 'radarr-1';
      const result = await processManualRun(
        instanceName,
        radarrConfig,
        radarrService.getMovies.bind(radarrService),
        radarrService.filterMovies.bind(radarrService),
        (m) => m.id,
        (m) => m.title
      );
      const resultKey = radarrInstances.length > 1 ? `${instanceId}` : 'radarr';
      results[resultKey] = {
        ...result,
        movies: result.items,
        instanceName
      };
    }

    // Process Sonarr
    const sonarrInstances = getConfiguredInstances(config.applications.sonarr);
    
    for (const sonarrConfig of sonarrInstances) {
      const instanceName = (sonarrConfig as any).name || 'Sonarr';
      const instanceId = (sonarrConfig as any).id || 'sonarr-1';
      const result = await processManualRun(
        instanceName,
        sonarrConfig,
        sonarrService.getSeries.bind(sonarrService),
        sonarrService.filterSeries.bind(sonarrService),
        (s) => s.id,
        (s) => s.title
      );
      const resultKey = sonarrInstances.length > 1 ? `${instanceId}` : 'sonarr';
      results[resultKey] = {
        ...result,
        series: result.items,
        instanceName
      };
    }

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

