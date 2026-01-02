/**
 * Utility functions for media synchronization
 * Centralizes logic for syncing media, quality profiles, and tag conversion
 */

import { capitalize } from 'es-toolkit';
import { statsService } from '../services/statsService.js';
import { getServiceForApp } from './serviceRegistry.js';
import logger from './logger.js';
import type { AppType } from './starrUtils.js';

interface SyncInstanceOptions {
  instanceId: string;
  appType: AppType;
  instance: any;
}

interface SyncResult {
  mediaCount: number;
  mediaWithTags: any[];
}

/**
 * Converts tag IDs to tag names for a collection of media items
 */
export async function convertMediaTagsToNames(
  service: ReturnType<typeof getServiceForApp>,
  instance: any,
  mediaItems: any[]
): Promise<any[]> {
  logger.debug('🏷️  Converting tag IDs to names', { count: mediaItems.length });
  
  const mediaWithTagNames = await Promise.all(
    mediaItems.map(async (item) => {
      const tagNames = await service.convertTagIdsToNames(instance, item.tags);
      return { ...item, tags: tagNames };
    })
  );
  
  logger.debug('✅ Tag IDs converted to names');
  return mediaWithTagNames;
}

/**
 * Syncs quality profiles for an instance
 */
export async function syncInstanceQualityProfiles(
  instanceId: string,
  appType: string,
  service: ReturnType<typeof getServiceForApp>,
  instance: any
): Promise<void> {
  logger.debug(`📡 [${capitalize(appType)} API] Fetching quality profiles`);
  const profiles = await service.getQualityProfiles(instance);

  logger.debug('💾 [Scoutarr DB] Syncing quality profiles to database');
  await statsService.syncQualityProfiles(instanceId, profiles);
  logger.debug('✅ [Scoutarr DB] Quality profiles synced');
}

/**
 * Fully syncs an instance: upsert instance, sync quality profiles, fetch media, convert tags
 */
export async function syncInstanceMedia(options: SyncInstanceOptions): Promise<SyncResult> {
  const { instanceId, appType, instance } = options;
  
  const service = getServiceForApp(appType);

  // Upsert instance record
  logger.debug('💾 [Scoutarr DB] Upserting instance record', { instanceId, appType });
  await statsService.upsertInstance(instanceId, appType, instance.name);

  // Sync quality profiles
  await syncInstanceQualityProfiles(instanceId, appType, service, instance);

  // Fetch all media from API
  logger.debug(`📡 [${capitalize(appType)} API] Fetching media`);
  const allMedia = await service.getMedia(instance);
  logger.debug('✅ [Scoutarr] Fetched all media from *arr API', { count: allMedia.length });

  // Convert tag IDs to names
  const mediaWithTags = await convertMediaTagsToNames(service, instance, allMedia);

  return {
    mediaCount: allMedia.length,
    mediaWithTags
  };
}
