import express from 'express';
import { configService } from '../services/configService.js';
import { radarrService } from '../services/radarrService.js';
import { sonarrService } from '../services/sonarrService.js';
import { lidarrService } from '../services/lidarrService.js';
import { readarrService } from '../services/readarrService.js';
import { statsService } from '../services/statsService.js';
import logger from '../utils/logger.js';
import { APP_TYPES, AppType } from '../utils/starrUtils.js';
import { getServiceForApp } from '../utils/serviceRegistry.js';
import { getErrorMessage } from '../utils/errorUtils.js';
import { RadarrInstance, SonarrInstance, LidarrInstance, ReadarrInstance, StarrInstanceConfig } from '@scoutarr/shared';

export const mediaLibraryRouter = express.Router();

// GET /api/media-library/:appType/:instanceId
// Fetch all media for an instance with last searched dates
// Query param: sync=true to force sync from API to database
mediaLibraryRouter.get('/:appType/:instanceId', async (req, res) => {
  try {
    const { appType, instanceId } = req.params;
    const shouldSync = req.query.sync === 'true';

    // Validate appType
    if (!APP_TYPES.includes(appType as AppType)) {
      return res.status(400).json({ error: 'Invalid app type' });
    }

    // Get config
    const config = configService.getConfig();
    const instances = config.applications[appType as AppType];

    if (!instances || !Array.isArray(instances)) {
      return res.status(404).json({ error: 'No instances configured for this app type' });
    }

    // Find the specific instance
    const instance = instances.find((inst: StarrInstanceConfig) => inst.id === instanceId);

    if (!instance) {
      return res.status(404).json({ error: 'Instance not found' });
    }

    // Get service for this app type
    const service = getServiceForApp(appType as AppType);

    logger.debug('📚 [Scoutarr] Fetching media library', {
      appType,
      instanceId,
      instanceName: instance.name,
      sync: shouldSync
    });

    // Upsert instance record
    logger.debug('💾 [Scoutarr DB] Upserting instance record', { instanceId, appType });
    await statsService.upsertInstance(instanceId, appType, instance.name);

    // Check if we should sync from API or use database
    let filteredMedia;
    let fromCache = false;

    if (shouldSync) {
      // Sync from API
      logger.debug('🔄 [Scoutarr] Syncing from *arr API', { appType });
      const allMedia = await service.getMedia(instance);
      logger.debug('✅ [Scoutarr] Fetched all media from *arr API', { count: allMedia.length });

      // Fetch and sync quality profiles
      logger.debug(`📡 [${appType.charAt(0).toUpperCase() + appType.slice(1)} API] Fetching quality profiles`);
      const profiles = await service.getQualityProfiles(instance);

      // Convert tag IDs to names before syncing
      logger.debug('🏷️  [Scoutarr] Converting tag IDs to names');
      const mediaWithTagNames = await Promise.all(
        allMedia.map(async (item) => {
          const tagNames = await service.convertTagIdsToNames(instance, item.tags);
          return { ...item, tags: tagNames };
        })
      );
      logger.debug('✅ [Scoutarr] Tag IDs converted to names');

      // Add quality profile names to media items
      logger.debug('🔧 [Scoutarr] Adding quality profile names');
      const profileMap = new Map(profiles.map(p => [p.id, p.name]));
      const mediaWithProfileNames = mediaWithTagNames.map(item => ({
        ...item,
        qualityProfileName: profileMap.get(item.qualityProfileId) || 'Unknown'
      }));
      logger.debug('✅ [Scoutarr] Quality profile names added');

      // Sync to database first (before filtering)
      logger.debug('💾 [Scoutarr DB] Syncing media to database', { count: mediaWithProfileNames.length });
      await statsService.syncMediaToDatabase(instanceId, mediaWithProfileNames);
      logger.debug('✅ [Scoutarr DB] Synced media to database');

      // Apply instance filter settings
      logger.debug('🔽 [Scoutarr] Applying instance filters');
      filteredMedia = await service.filterMedia(instance, allMedia);
      logger.debug('✅ [Scoutarr] Applied instance filters', {
        total: allMedia.length,
        filtered: filteredMedia.length
      });
    } else {
      // Try to get from database first
      logger.debug('💾 [Scoutarr DB] Attempting to load from cache');
      const dbMedia = await statsService.getMediaFromDatabase(instanceId);

      if (dbMedia.length > 0) {
        logger.debug('✅ [Scoutarr DB] Using cached media from database', { count: dbMedia.length });
        fromCache = true;

        // Convert database format to API format for filtering
        const mediaFromDb = dbMedia.map(m => ({
          id: m.media_id,
          title: m.title,
          monitored: m.monitored,
          tags: m.tags,
          qualityProfileName: m.quality_profile_name || undefined,
          status: m.status,
          lastSearchTime: m.last_search_time || undefined,
          added: m.added || undefined,
          movieFile: m.date_imported ? {
            dateAdded: m.date_imported,
            customFormatScore: m.custom_format_score
          } : undefined,
          episodeFile: m.date_imported ? {
            dateAdded: m.date_imported,
            customFormatScore: m.custom_format_score
          } : undefined,
        }));

        // Re-apply instance filters (settings may have changed since sync)
        logger.debug('🔽 [Scoutarr] Applying instance filters to cached data');
        filteredMedia = await service.filterMedia(instance, mediaFromDb);
        logger.debug('✅ [Scoutarr] Applied instance filters to cached data', {
          total: mediaFromDb.length,
          filtered: filteredMedia.length
        });
      } else {
        // No data in database, fetch from API
        logger.debug('📡 [Scoutarr DB] No cached data, fetching from *arr API', { appType });
        const allMedia = await service.getMedia(instance);
        logger.debug('✅ [Scoutarr] Fetched all media from *arr API', { count: allMedia.length });

        // Fetch and sync quality profiles
        logger.debug(`📡 [${appType.charAt(0).toUpperCase() + appType.slice(1)} API] Fetching quality profiles`);
        const profiles = await service.getQualityProfiles(instance);

        // Convert tag IDs to names before syncing
        logger.debug('🏷️  [Scoutarr] Converting tag IDs to names');
        const mediaWithTagNames = await Promise.all(
          allMedia.map(async (item) => {
            const tagNames = await service.convertTagIdsToNames(instance, item.tags);
            return { ...item, tags: tagNames };
          })
        );
        logger.debug('✅ [Scoutarr] Tag IDs converted to names');

        // Add quality profile names to media items
        logger.debug('🔧 [Scoutarr] Adding quality profile names');
        const profileMap2 = new Map(profiles.map(p => [p.id, p.name]));
        const mediaWithProfileNames2 = mediaWithTagNames.map(item => ({
          ...item,
          qualityProfileName: profileMap2.get(item.qualityProfileId) || 'Unknown'
        }));
        logger.debug('✅ [Scoutarr] Quality profile names added');

        // Sync to database
        logger.debug('💾 [Scoutarr DB] Syncing media to database', { count: mediaWithProfileNames2.length });
        await statsService.syncMediaToDatabase(instanceId, mediaWithProfileNames2);
        logger.debug('✅ [Scoutarr DB] Synced media to database');

        // Apply instance filter settings
        logger.debug('🔽 [Scoutarr] Applying instance filters');
        filteredMedia = await service.filterMedia(instance, allMedia);
        logger.debug('✅ [Scoutarr] Applied instance filters', {
          total: allMedia.length,
          filtered: filteredMedia.length
        });
      }
    }

    // Transform media to response format
    // Use native lastSearchTime from the API (more accurate than our database)
    const mediaWithDates = filteredMedia.map(m => {
      // Extract dateImported, customFormatScore, and hasFile from file
      let dateImported: string | undefined;
      let customFormatScore: number | undefined;
      let hasFile = false;

      if (m.movieFile?.dateAdded) {
        dateImported = m.movieFile.dateAdded;
        hasFile = true;
        customFormatScore = (m.movieFile as { customFormatScore?: number }).customFormatScore;
      } else if (m.episodeFile?.dateAdded) {
        dateImported = m.episodeFile.dateAdded;
        hasFile = true;
        customFormatScore = (m.episodeFile as { customFormatScore?: number }).customFormatScore;
      } else if (m.trackFiles && m.trackFiles.length > 0) {
        // For Lidarr, use the most recent track file
        const dates = m.trackFiles.map((f: { dateAdded?: string }) => f.dateAdded).filter((d: string | undefined): d is string => !!d);
        if (dates.length > 0) {
          dateImported = dates.sort().reverse()[0]; // Most recent
          hasFile = true;
          const trackWithScore = m.trackFiles.find((f: { customFormatScore?: number }) => (f as { customFormatScore?: number }).customFormatScore !== undefined);
          customFormatScore = trackWithScore ? (trackWithScore as { customFormatScore?: number }).customFormatScore : undefined;
        }
      } else if (m.bookFiles && m.bookFiles.length > 0) {
        // For Readarr, use the most recent book file
        const dates = m.bookFiles.map((f: { dateAdded?: string }) => f.dateAdded).filter((d: string | undefined): d is string => !!d);
        if (dates.length > 0) {
          dateImported = dates.sort().reverse()[0]; // Most recent
          hasFile = true;
          const bookWithScore = m.bookFiles.find((f: { customFormatScore?: number }) => (f as { customFormatScore?: number }).customFormatScore !== undefined);
          customFormatScore = bookWithScore ? (bookWithScore as { customFormatScore?: number }).customFormatScore : undefined;
        }
      }

      return {
        id: service.getMediaId(m),
        title: service.getMediaTitle(m),
        monitored: m.monitored,
        status: m.status,
        qualityProfileName: m.qualityProfileName,
        tags: m.tags,
        lastSearched: m.lastSearchTime, // Native field from Radarr/Sonarr/Lidarr/Readarr API
        dateImported: dateImported || m.added, // File import date, fallback to when added to library
        customFormatScore,
        hasFile
      };
    });

    const withLastSearchCount = mediaWithDates.filter(m => m.lastSearched).length;
    logger.debug('✅ [Scoutarr] Media library prepared', {
      total: mediaWithDates.length,
      withLastSearchTime: withLastSearchCount,
      fromCache
    });

    // Return response
    res.json({
      media: mediaWithDates,
      total: mediaWithDates.length,
      instanceName: instance.name || `${appType}-${instanceId}`,
      appType,
      fromCache
    });

  } catch (error: unknown) {
    const errorMessage = getErrorMessage(error);
    logger.error('❌ Error fetching media library', {
      error: errorMessage,
      appType: req.params.appType,
      instanceId: req.params.instanceId
    });
    res.status(500).json({
      error: 'Failed to fetch media library',
      message: errorMessage
    });
  }
});

// POST /api/media-library/search
// Search selected media manually
mediaLibraryRouter.post('/search', async (req, res) => {
  try {
    const { appType, instanceId, mediaIds } = req.body;

    // Validate inputs
    if (!appType || !instanceId || !Array.isArray(mediaIds) || mediaIds.length === 0) {
      return res.status(400).json({ error: 'Invalid request. Required: appType, instanceId, mediaIds (non-empty array)' });
    }

    if (!APP_TYPES.includes(appType as AppType)) {
      return res.status(400).json({ error: 'Invalid app type' });
    }

    // Get config
    const config = configService.getConfig();
    const instances = config.applications[appType as AppType];

    if (!instances || !Array.isArray(instances)) {
      return res.status(404).json({ error: 'No instances configured for this app type' });
    }

    const instance = instances.find((inst: StarrInstanceConfig) => inst.id === instanceId);

    if (!instance) {
      return res.status(404).json({ error: 'Instance not found' });
    }

    logger.info('🔎 [Scoutarr] Manual search started', {
      appType,
      instanceId,
      instanceName: instance.name,
      mediaCount: mediaIds.length
    });

    // Get service for this app type
    const service = getServiceForApp(appType as AppType);

    // Search based on app type
    if (appType === 'radarr') {
      // Radarr supports bulk search
      await radarrService.searchMovies(instance as RadarrInstance, mediaIds);
      logger.debug('✅ [Scoutarr] Bulk search started for Radarr', { count: mediaIds.length });
    } else if (appType === 'sonarr') {
      // Sonarr requires one-by-one
      for (const mediaId of mediaIds) {
        await sonarrService.searchSeries(instance as SonarrInstance, mediaId);
      }
      logger.debug('✅ [Scoutarr] Sequential search started for Sonarr', { count: mediaIds.length });
    } else if (appType === 'lidarr') {
      // Lidarr requires one-by-one
      for (const mediaId of mediaIds) {
        await lidarrService.searchArtists(instance as LidarrInstance, mediaId);
      }
      logger.debug('✅ [Scoutarr] Sequential search started for Lidarr', { count: mediaIds.length });
    } else if (appType === 'readarr') {
      // Readarr requires one-by-one
      for (const mediaId of mediaIds) {
        await readarrService.searchAuthors(instance as ReadarrInstance, mediaId);
      }
      logger.debug('✅ [Scoutarr] Sequential search started for Readarr', { count: mediaIds.length });
    }

    // Add tag to searched items
    const tagName = instance.tagName || 'upgradinatorr';
    logger.debug(`📡 [${appType.charAt(0).toUpperCase() + appType.slice(1)} API] Getting tag ID`, { tagName });
    const tagId = await service.getTagId(instance, tagName);

    if (tagId !== null) {
      logger.debug(`📡 [${appType.charAt(0).toUpperCase() + appType.slice(1)} API] Adding tag to media`, { tagId, count: mediaIds.length });
      await service.addTag(instance, mediaIds, tagId);
      logger.debug('✅ [Scoutarr] Tag added to media', { tagId, count: mediaIds.length });

      // Track tag in instances table
      logger.debug('💾 [Scoutarr DB] Tracking tag in instance', { tagName });
      await statsService.addScoutarrTagToInstance(instanceId, tagName);
      logger.debug('✅ [Scoutarr DB] Tag tracked in instance');
    } else {
      logger.warn('⚠️  [Scoutarr] Tag not found, skipping tag addition', { tagName });
    }

    // Return success
    res.json({
      success: true,
      searched: mediaIds.length,
      message: `Successfully searched ${mediaIds.length} item${mediaIds.length === 1 ? '' : 's'}`
    });

  } catch (error: unknown) {
    const errorMessage = getErrorMessage(error);
    logger.error('❌ Manual search failed', {
      error: errorMessage,
      appType: req.body.appType,
      instanceId: req.body.instanceId
    });
    res.status(500).json({
      success: false,
      error: 'Search failed',
      message: errorMessage
    });
  }
});

export default mediaLibraryRouter;
