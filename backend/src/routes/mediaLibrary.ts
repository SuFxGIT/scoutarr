import express from 'express';
import { capitalize } from 'es-toolkit';
import { configService } from '../services/configService.js';
import { statsService } from '../services/statsService.js';
import logger, { startOperation } from '../utils/logger.js';
import { APP_TYPES, AppType } from '../utils/starrUtils.js';
import { getServiceForApp } from '../utils/serviceRegistry.js';
import { getErrorMessage, handleRouteError } from '../utils/errorUtils.js';
import { extractFileInfo, type MediaWithFiles } from '../utils/mediaFileUtils.js';
import { syncInstanceMedia } from '../utils/mediaSync.js';
import type { StarrInstanceConfig } from '@scoutarr/shared';

type MediaItem = MediaWithFiles & {
  id: number;
  title: string;
  monitored: boolean;
  tags: string[];
  qualityProfileId?: number;
  qualityProfileName?: string;
  status: string;
  lastSearchTime?: string;
  externalId?: string;
  seriesId?: number;
  seriesTitle?: string;
  seasonNumber?: number;
  episodeNumber?: number;
  episodeTitle?: string;
};

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
    let allMedia: MediaItem[];
    let fromCache = false;

    if (shouldSync) {
      // Sync from API using centralized utility
      logger.debug('🔄 [Scoutarr] Syncing from *arr API', { appType });
      const syncResult = await syncInstanceMedia({
        instanceId,
        appType: appType as AppType,
        instance
      });
      allMedia = (syncResult.mediaWithTags as MediaItem[]).map(m => {
        const mediaAny = m as any;
        let externalId: string | undefined;
        switch (appType) {
          case 'radarr':
            externalId = mediaAny.tmdbId ? String(mediaAny.tmdbId) : undefined;
            break;
          case 'sonarr':
            externalId = mediaAny.titleSlug || undefined;
            break;
          case 'lidarr':
            externalId = mediaAny.foreignArtistId || String(m.id);
            break;
          case 'readarr':
            externalId = mediaAny.foreignAuthorId || String(m.id);
            break;
          default:
            externalId = String(m.id);
        }
        return { ...m, externalId, title: service.getMediaTitle(m) };
      });
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
      allMedia = dbMedia.map(m => ({
        id: m.media_id,
        title: m.title,
        monitored: m.monitored,
        tags: m.tags,
        qualityProfileName: m.quality_profile_name ?? undefined,
        status: m.status,
        lastSearchTime: m.last_search_time ?? undefined,
        externalId: m.external_id ?? undefined,
        movieFile: m.date_imported ? {
          dateAdded: m.date_imported,
          customFormatScore: m.custom_format_score ?? undefined
        } : undefined,
        episodeFile: m.date_imported ? {
          dateAdded: m.date_imported,
          customFormatScore: m.custom_format_score ?? undefined
        } : undefined,
        seriesId: m.series_id ?? undefined,
        seriesTitle: m.series_title ?? undefined,
        seasonNumber: m.season_number ?? undefined,
        episodeNumber: m.episode_number ?? undefined,
      }));
    }

    // Fetch previous CF scores (second-most-recent from history) in one query
    const previousCfScores = await statsService.getPreviousCfScores(instanceId);

    // Transform media to response format
    const mediaWithDates = allMedia.map(m => {
      const fileInfo = extractFileInfo(m);
      const mediaId = service.getMediaId(m);
      const mediaAny = m as any;

      return {
        id: m.id,
        title: service.getMediaTitle(m),
        monitored: m.monitored,
        status: m.status,
        qualityProfileName: m.qualityProfileName,
        tags: m.tags,
        lastSearched: m.lastSearchTime,
        dateImported: fileInfo.dateImported,
        customFormatScore: fileInfo.customFormatScore,
        previousCfScore: previousCfScores.has(mediaId) ? previousCfScores.get(mediaId) : undefined,
        hasFile: fileInfo.hasFile,
        externalId: mediaAny.externalId,
        seriesId: mediaAny.seriesId,
        seriesTitle: mediaAny.seriesTitle,
        seasonNumber: mediaAny.seasonNumber,
        episodeNumber: mediaAny.episodeNumber,
        episodeTitle: mediaAny.episodeTitle,
      };
    });

    const withLastSearchCount = mediaWithDates.filter(m => m.lastSearched).length;
    logger.debug('✅ [Scoutarr] Media library prepared', {
      total: allMedia.length,
      withLastSearchTime: withLastSearchCount,
      fromCache
    });

    // Get scoutarr_tags for this instance
    const instanceRecord = await statsService.getInstance(instanceId);
    const scoutarrTags = instanceRecord ? JSON.parse(instanceRecord.scoutarr_tags || '[]') as string[] : [];

    // Return response
    res.json({
      media: mediaWithDates,
      total: allMedia.length,
      instanceName: instance.name || `${appType}-${instanceId}`,
      appType,
      scoutarrTags,
      fromCache
    });
    endOp({ total: allMedia.length }, true);

  } catch (error: unknown) {
    endOp({ error: getErrorMessage(error) }, false);
    handleRouteError(res, error, 'Failed to fetch media library');
  }
});

// GET /api/media-library/:appType/:instanceId/:mediaId/cf-history
// Fetch CF score history for a specific media item
mediaLibraryRouter.get('/:appType/:instanceId/:mediaId/cf-history', async (req, res) => {
  const { appType, instanceId, mediaId: mediaIdParam } = req.params;
  const mediaId = parseInt(mediaIdParam, 10);

  try {
    if (!APP_TYPES.includes(appType as AppType)) {
      return res.status(400).json({ error: 'Invalid app type' });
    }

    const history = await statsService.getCfScoreHistory(instanceId, mediaId);

    res.json({
      instanceId,
      mediaId,
      history: history.map(h => ({
        score: h.score,
        recordedAt: h.recorded_at
      }))
    });
  } catch (error: unknown) {
    handleRouteError(res, error, 'Failed to fetch CF score history');
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
    const { appType, instanceId, mediaIds, force } = req.body;

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

    const tagName = instance.tagName || 'upgradinatorr';
    const ignoreTag = (instance as any).ignoreTag as string | undefined;

    // Get status config for this app type
    const statusConfig: string | undefined =
      appType === 'radarr' ? (instance as any).movieStatus :
      appType === 'sonarr' ? (instance as any).seriesStatus :
      appType === 'lidarr' ? (instance as any).artistStatus :
      appType === 'readarr' ? (instance as any).authorStatus : undefined;

    // Map config status values to *arr API status strings (Radarr uses 'inCinemas' not 'in cinemas')
    function normalizeStatusConfig(val: string): string {
      return val === 'in cinemas' ? 'inCinemas' : val;
    }

    // Fetch live tags and status directly from arr instance (not Scoutarr DB) to avoid stale data
    const service = getServiceForApp(appType as AppType);
    const [liveTagsMap, liveStatusMap] = await Promise.all([
      service.getLiveTagsForIds(instance, mediaIds),
      (statusConfig && statusConfig !== 'any' && statusConfig !== '')
        ? service.getLiveStatusForIds(instance, mediaIds)
        : Promise.resolve(new Map<number, string>())
    ]);

    const validIds: number[] = [];
    const conflicts: { id: number; reason: string }[] = [];

    for (const id of mediaIds) {
      const tags = liveTagsMap.get(id) ?? [];

      if (tags.includes(tagName)) {
        logger.warn('⚠️  [Scoutarr] Conflict: already-tagged item in manual search', { id, tagName });
        conflicts.push({ id, reason: `Already tagged with "${tagName}"` });
        continue;
      }
      if (ignoreTag && tags.includes(ignoreTag)) {
        logger.warn('⚠️  [Scoutarr] Conflict: ignore-tagged item in manual search', { id, ignoreTag });
        conflicts.push({ id, reason: `Has ignore tag "${ignoreTag}"` });
        continue;
      }
      if (statusConfig && statusConfig !== 'any' && statusConfig !== '') {
        const liveStatus = liveStatusMap.get(id) ?? '';
        if (liveStatus && liveStatus !== normalizeStatusConfig(statusConfig)) {
          logger.warn('⚠️  [Scoutarr] Conflict: wrong-status item in manual search', { id, status: liveStatus, required: statusConfig });
          conflicts.push({ id, reason: `Status is "${liveStatus}" but config requires "${statusConfig}"` });
          continue;
        }
      }
      validIds.push(id);
    }

    // If there are conflicts and not forcing, return them to the client for confirmation
    if (conflicts.length > 0 && !force) {
      endOp({ searched: 0, conflicts: conflicts.length }, true);
      return res.json({
        success: true,
        searched: 0,
        conflicts,
        message: `${conflicts.length} item${conflicts.length === 1 ? ' has' : 's have'} config conflicts`
      });
    }

    // When forcing, search all originally requested IDs (bypass conflict checks)
    const idsToSearch = force ? mediaIds : validIds;

    if (conflicts.length > 0 && force) {
      logger.info('ℹ️  [Scoutarr] Force search: bypassing conflicts', { conflicts: conflicts.length, total: mediaIds.length });
    }

    // Search media using the already-initialized service
    await service.searchMedia(instance, idsToSearch);
    logger.debug('✅ [Scoutarr] Search started', { appType, count: idsToSearch.length });

    // Add tag to searched items
    logger.debug(`📡 [${capitalize(appType)} API] Getting tag ID`, { tagName });
    const tagId = await service.getTagId(instance, tagName);

    if (tagId !== null) {
      logger.debug(`📡 [${capitalize(appType)} API] Adding tag to media`, { tagId, count: idsToSearch.length });
      await service.addTag(instance, idsToSearch, tagId);
      logger.debug('✅ [Scoutarr] Tag added to media', { tagId, count: idsToSearch.length });

      // Track tag in instances table
      logger.debug('💾 [Scoutarr DB] Tracking tag in instance', { tagName });
      await statsService.addScoutarrTagToInstance(instanceId, tagName);
      logger.debug('✅ [Scoutarr DB] Tag tracked in instance');
    } else {
      logger.warn('⚠️  [Scoutarr] Tag not found, skipping tag addition', { tagName });
    }

    // Record in search history
    // For Sonarr, idsToSearch are series IDs (converted on the frontend), so look up by series_id
    const items = appType === 'sonarr'
      ? await statsService.getSeriesTitlesByIds(instanceId, idsToSearch)
      : await statsService.getMediaTitlesByIds(instanceId, idsToSearch);
    await statsService.addSearch(appType, idsToSearch.length, items, instance.name, instanceId);

    // Return success
    res.json({
      success: true,
      searched: idsToSearch.length,
      message: `Successfully searched ${idsToSearch.length} item${idsToSearch.length === 1 ? '' : 's'}`
    });
    endOp({ searched: idsToSearch.length }, true);

  } catch (error: unknown) {
    endOp({ error: getErrorMessage(error) }, false);
    handleRouteError(res, error, 'Manual search failed');
  }
});
