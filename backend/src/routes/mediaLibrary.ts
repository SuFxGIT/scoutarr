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

    logger.debug('📚 Fetching media library', {
      appType,
      instanceId,
      instanceName: instance.name,
      sync: shouldSync
    });

    // Upsert instance record
    await statsService.upsertInstance(instanceId, appType, instance.name);

    // Check if we should sync from API or use database
    let filteredMedia;
    let fromCache = false;

    if (shouldSync) {
      // Sync from API
      logger.debug('🔄 Syncing from API');
      const allMedia = await service.getMedia(instance);
      logger.debug('✅ Fetched all media from API', { count: allMedia.length });

      // Sync to database first (before filtering)
      await statsService.syncMediaToDatabase(instanceId, allMedia);
      logger.debug('✅ Synced media to database');

      // Apply instance filter settings
      filteredMedia = await service.filterMedia(instance, allMedia);
      logger.debug('✅ Applied instance filters', {
        total: allMedia.length,
        filtered: filteredMedia.length
      });
    } else {
      // Try to get from database first
      const dbMedia = await statsService.getMediaFromDatabase(instanceId);

      if (dbMedia.length > 0) {
        logger.debug('✅ Using cached media from database', { count: dbMedia.length });
        fromCache = true;

        // Convert database format to API format for filtering
        filteredMedia = dbMedia.map(m => ({
          id: m.media_id,
          title: m.title,
          monitored: m.monitored,
          tags: m.tags,
          qualityProfileId: m.quality_profile_id,
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
      } else {
        // No data in database, fetch from API
        logger.debug('📡 No cached data, fetching from API');
        const allMedia = await service.getMedia(instance);
        logger.debug('✅ Fetched all media from API', { count: allMedia.length });

        // Sync to database
        await statsService.syncMediaToDatabase(instanceId, allMedia);
        logger.debug('✅ Synced media to database');

        // Apply instance filter settings
        filteredMedia = await service.filterMedia(instance, allMedia);
        logger.debug('✅ Applied instance filters', {
          total: allMedia.length,
          filtered: filteredMedia.length
        });
      }
    }

    // Get quality profiles for name mapping
    const profiles = await service.getQualityProfiles(instance);
    const profileMap = new Map(profiles.map(p => [p.id, p.name]));

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
        qualityProfileId: m.qualityProfileId,
        qualityProfileName: profileMap.get(m.qualityProfileId),
        tags: m.tags,
        lastSearched: m.lastSearchTime, // Native field from Radarr/Sonarr/Lidarr/Readarr API
        dateImported: dateImported || m.added, // File import date, fallback to when added to library
        customFormatScore,
        hasFile
      };
    });

    const withLastSearchCount = mediaWithDates.filter(m => m.lastSearched).length;
    logger.debug('✅ Media library prepared', {
      total: mediaWithDates.length,
      withLastSearchTime: withLastSearchCount
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

    logger.info('🔎 Manual search started', {
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
      logger.debug('✅ Bulk search started for Radarr', { count: mediaIds.length });
    } else if (appType === 'sonarr') {
      // Sonarr requires one-by-one
      for (const mediaId of mediaIds) {
        await sonarrService.searchSeries(instance as SonarrInstance, mediaId);
      }
      logger.debug('✅ Sequential search started for Sonarr', { count: mediaIds.length });
    } else if (appType === 'lidarr') {
      // Lidarr requires one-by-one
      for (const mediaId of mediaIds) {
        await lidarrService.searchArtists(instance as LidarrInstance, mediaId);
      }
      logger.debug('✅ Sequential search started for Lidarr', { count: mediaIds.length });
    } else if (appType === 'readarr') {
      // Readarr requires one-by-one
      for (const mediaId of mediaIds) {
        await readarrService.searchAuthors(instance as ReadarrInstance, mediaId);
      }
      logger.debug('✅ Sequential search started for Readarr', { count: mediaIds.length });
    }

    // Add tag to searched items
    const tagName = instance.tagName || 'upgradinatorr';
    const tagId = await service.getTagId(instance, tagName);

    if (tagId !== null) {
      await service.addTag(instance, mediaIds, tagId);
      logger.debug('✅ Tag added to media', { tagId, count: mediaIds.length });

      // Record in tagged_media table (updates last searched date)
      await statsService.addTaggedMedia(appType, instanceId, tagId, mediaIds);
      logger.debug('✅ Tagged media recorded in database');
    } else {
      logger.warn('⚠️  Tag not found, skipping tag addition', { tagName });
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

// PUT /api/media-library/:instanceId/:mediaId/score
// Update custom score for a media item
mediaLibraryRouter.put('/:instanceId/:mediaId/score', async (req, res) => {
  try {
    const { instanceId, mediaId } = req.params;
    const { customScore } = req.body;

    // Validate inputs
    if (!instanceId || !mediaId) {
      return res.status(400).json({ error: 'Missing required parameters: instanceId, mediaId' });
    }

    if (customScore !== null && (typeof customScore !== 'number' || customScore < 0 || customScore > 100)) {
      return res.status(400).json({ error: 'Custom score must be a number between 0 and 100, or null' });
    }

    logger.debug('📝 Updating custom score', {
      instanceId,
      mediaId,
      customScore
    });

    await statsService.updateMediaCustomScore(instanceId, parseInt(mediaId), customScore);

    res.json({
      success: true,
      message: 'Custom score updated successfully'
    });

  } catch (error: unknown) {
    const errorMessage = getErrorMessage(error);
    logger.error('❌ Error updating custom score', {
      error: errorMessage,
      instanceId: req.params.instanceId,
      mediaId: req.params.mediaId
    });
    res.status(500).json({
      success: false,
      error: 'Failed to update custom score',
      message: errorMessage
    });
  }
});
