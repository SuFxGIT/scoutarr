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
mediaLibraryRouter.get('/:appType/:instanceId', async (req, res) => {
  try {
    const { appType, instanceId } = req.params;

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
      instanceName: instance.name
    });

    // Fetch all media
    const allMedia = await service.getMedia(instance);
    logger.debug('✅ Fetched all media', { count: allMedia.length });

    // Apply instance filter settings
    const filteredMedia = await service.filterMedia(instance, allMedia);
    logger.debug('✅ Applied instance filters', {
      total: allMedia.length,
      filtered: filteredMedia.length
    });

    // Get quality profiles for name mapping
    const profiles = await service.getQualityProfiles(instance);
    const profileMap = new Map(profiles.map(p => [p.id, p.name]));

    // Transform media to response format
    // Use native lastSearchTime from the API (more accurate than our database)
    const mediaWithDates = filteredMedia.map(m => {
      // Extract dateImported from file (Radarr uses movieFile, Sonarr uses episodeFile,
      // Lidarr uses trackFiles array, Readarr uses bookFiles array)
      let dateImported: string | undefined;
      if (m.movieFile?.dateAdded) {
        dateImported = m.movieFile.dateAdded;
      } else if (m.episodeFile?.dateAdded) {
        dateImported = m.episodeFile.dateAdded;
      } else if (m.trackFiles && m.trackFiles.length > 0) {
        // For Lidarr, use the most recent track file
        const dates = m.trackFiles.map((f: { dateAdded?: string }) => f.dateAdded).filter((d: string | undefined): d is string => !!d);
        if (dates.length > 0) {
          dateImported = dates.sort().reverse()[0]; // Most recent
        }
      } else if (m.bookFiles && m.bookFiles.length > 0) {
        // For Readarr, use the most recent book file
        const dates = m.bookFiles.map((f: { dateAdded?: string }) => f.dateAdded).filter((d: string | undefined): d is string => !!d);
        if (dates.length > 0) {
          dateImported = dates.sort().reverse()[0]; // Most recent
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
        dateImported: dateImported || m.added // File import date, fallback to when added to library
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
      appType
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
