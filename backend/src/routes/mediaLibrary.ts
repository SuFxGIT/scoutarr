import express from 'express';
import { configService } from '../services/configService.js';
import { statsService } from '../services/statsService.js';
import logger, { startOperation } from '../utils/logger.js';
import { APP_TYPES, AppType } from '../utils/starrUtils.js';
import { getServiceForApp } from '../utils/serviceRegistry.js';
import { getErrorMessage, handleRouteError } from '../utils/errorUtils.js';
import { extractFileInfo } from '../utils/mediaFileUtils.js';
import { syncInstanceMedia } from '../utils/mediaSync.js';
import type { StarrInstanceConfig } from '@scoutarr/shared';

export const mediaLibraryRouter = express.Router();

// GET /api/media-library/:appType/:instanceId
// Fetch all media for an instance
// Query param: sync=true to force sync from API to database
mediaLibraryRouter.get('/:appType/:instanceId', async (req, res) => {
  const { appType, instanceId } = req.params;
  const endOp = startOperation('MediaLibrary.get', { appType, instanceId });
  try {
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

    // Check if we should sync from API or use database
    let allMedia;
    let fromCache = false;

    if (shouldSync) {
      // Sync from API using centralized utility
      logger.debug('🔄 [Scoutarr] Syncing from *arr API', { appType });
      const syncResult = await syncInstanceMedia({
        instanceId,
        appType: appType as AppType,
        instance
      });
      
      allMedia = syncResult.mediaWithTags;
      
      // Sync to database
      logger.debug('💾 [Scoutarr DB] Syncing media to database', { count: allMedia.length });
      await statsService.syncMediaToDatabase(instanceId, allMedia);
      logger.debug('✅ [Scoutarr DB] Synced media to database');
    } else {
      // Always use database (no API fallback)
      logger.debug('💾 [Scoutarr DB] Loading from database');
      const dbMedia = await statsService.getMediaFromDatabase(instanceId);
      logger.debug('✅ [Scoutarr DB] Loaded media from database', { count: dbMedia.length });
      fromCache = true;

      // Convert database format to API format
      allMedia = dbMedia.map(m => ({
        id: m.media_id,
        title: m.title,
        monitored: m.monitored,
        tags: m.tags,
        qualityProfileName: m.quality_profile_name || undefined,
        status: m.status,
        lastSearchTime: m.last_search_time || undefined,
        movieFile: m.date_imported ? {
          dateAdded: m.date_imported,
          customFormatScore: m.custom_format_score
        } : undefined,
        episodeFile: m.date_imported ? {
          dateAdded: m.date_imported,
          customFormatScore: m.custom_format_score
        } : undefined,
      }));

    }

    // Transform media to response format
    // Use native lastSearchTime from the API (more accurate than our database)
    const mediaWithDates = allMedia.map(m => {
      // Extract file information using centralized utility
      const fileInfo = extractFileInfo(m);

      return {
        id: service.getMediaId(m),
        title: service.getMediaTitle(m),
        monitored: m.monitored,
        status: m.status,
        qualityProfileName: m.qualityProfileName,
        tags: m.tags,
        lastSearched: m.lastSearchTime,
        dateImported: fileInfo.dateImported,
        customFormatScore: fileInfo.customFormatScore,
        hasFile: fileInfo.hasFile
      };
    });

    const withLastSearchCount = mediaWithDates.filter(m => m.lastSearched).length;
    logger.debug('✅ [Scoutarr] Media library prepared', {
      total: allMedia.length,
      withLastSearchTime: withLastSearchCount,
      fromCache
    });

    // Return response
    res.json({
      media: mediaWithDates,
      total: allMedia.length,
      instanceName: instance.name || `${appType}-${instanceId}`,
      appType,
      fromCache
    });
    endOp({ total: allMedia.length }, true);

  } catch (error: unknown) {
    endOp({ error: getErrorMessage(error) }, false);
    handleRouteError(res, error, 'Failed to fetch media library');
  }
});

// POST /api/media-library/search
// Search selected media manually
mediaLibraryRouter.post('/search', async (req, res) => {
  const endOp = startOperation('MediaLibrary.search', { 
    appType: req.body.appType, 
    instanceId: req.body.instanceId, 
    count: Array.isArray(req.body.mediaIds) ? req.body.mediaIds.length : 0 
  });
  
  try {
    const { appType, instanceId, mediaIds } = req.body;

    // Validate inputs
    if (!appType || !instanceId || !Array.isArray(mediaIds) || mediaIds.length === 0) {
      endOp({ error: 'Invalid request' }, false);
      return res.status(400).json({ error: 'Invalid request. Required: appType, instanceId, mediaIds (non-empty array)' });
    }

    if (!APP_TYPES.includes(appType as AppType)) {
      endOp({ error: 'Invalid app type' }, false);
      return res.status(400).json({ error: 'Invalid app type' });
    }

    // Get config
    const config = configService.getConfig();
    const instances = config.applications[appType as AppType];

    if (!instances || !Array.isArray(instances)) {
      endOp({ error: 'No instances configured' }, false);
      return res.status(404).json({ error: 'No instances configured for this app type' });
    }

    const instance = instances.find((inst: StarrInstanceConfig) => inst.id === instanceId);

    if (!instance) {
      endOp({ error: 'Instance not found' }, false);
      return res.status(404).json({ error: 'Instance not found' });
    }

    logger.info('🔎 [Scoutarr] Manual search started', {
      appType,
      instanceId,
      instanceName: instance.name,
      mediaCount: mediaIds.length
    });

    // Get service for this app type and search media
    const service = getServiceForApp(appType as AppType);
    await service.searchMedia(instance, mediaIds);
    logger.debug('✅ [Scoutarr] Search started', { appType, count: mediaIds.length });

    // Add tag to searched items
    const tagName = instance.tagName || 'upgradinatorr';
    logger.debug(`📡 [${capitalize(appType)} API] Getting tag ID`, { tagName });
    const tagId = await service.getTagId(instance, tagName);

    if (tagId !== null) {
      logger.debug(`📡 [${capitalize(appType)} API] Adding tag to media`, { tagId, count: mediaIds.length });
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
    endOp({ searched: mediaIds.length }, true);

  } catch (error: unknown) {
    endOp({ error: getErrorMessage(error) }, false);
    handleRouteError(res, error, 'Manual search failed');
  }
});
