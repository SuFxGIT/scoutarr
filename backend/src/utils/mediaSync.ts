/**
 * Utility functions for media synchronization
 * Centralizes logic for syncing media, quality profiles, and tag conversion
 */

import { statsService } from '../services/statsService.js';
import { getServiceForApp } from './serviceRegistry.js';
import logger from './logger.js';
import type { AppType } from './starrUtils.js';
import type { StarrInstanceConfig } from '@scoutarr/shared';

interface SyncInstanceOptions {
  instanceId: string;
  appType: AppType;
  instance: StarrInstanceConfig;
}

interface SyncResult<TMedia = unknown> {
  mediaCount: number;
  mediaWithTags: TMedia[];
}

/**
 * Converts tag IDs to tag names for a collection of media items
 * Fetches the tag list once and reuses it for all media items.
 */
export async function convertMediaTagsToNames<TMedia extends { tags: number[] }>(
  service: ReturnType<typeof getServiceForApp>,
  instance: StarrInstanceConfig,
  mediaItems: TMedia[]
): Promise<Array<Omit<TMedia, 'tags'> & { tags: string[] }>> {
  logger.debug('🏷️  Converting tag IDs to names', { count: mediaItems.length });

  // Fetch all tags once to build a lookup map
  const allTags = await service.getAllTags(instance);
  const tagMap = new Map(allTags.map((t: { id: number; label: string }) => [t.id, t.label]));
  logger.debug('🏷️  Fetched tag list', { tagCount: allTags.length });

  const mediaWithTagNames = mediaItems.map((item) => {
    const tagNames = item.tags.map((id: number) => {
      const tagName = tagMap.get(id);
      if (!tagName) {
        logger.warn(`⚠️  Unknown tag ID during sync`, { tagId: id });
      }
      return tagName || `unknown-tag-${id}`;
    });
    return { ...item, tags: tagNames };
  });

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
  instance: StarrInstanceConfig
): Promise<void> {
  logger.debug(`📡 [${appType.charAt(0).toUpperCase() + appType.slice(1)} API] Fetching quality profiles`);
  const profiles = await service.getQualityProfiles(instance);

  logger.debug('💾 [Scoutarr DB] Syncing quality profiles to database');
  await statsService.syncQualityProfiles(instanceId, profiles);
  logger.debug('✅ [Scoutarr DB] Quality profiles synced');
}

/**
 * Extracts the externalId for a media item based on app type.
 * Used to build deep links into the arr application.
 */
export function extractExternalId(appType: AppType, item: Record<string, unknown>, fallbackId: number): string | undefined {
  switch (appType) {
    case 'radarr':
      return item.tmdbId ? String(item.tmdbId) : undefined;
    case 'sonarr':
      return (item.titleSlug as string) || undefined;
    case 'lidarr':
      return (item.foreignArtistId as string) || String(fallbackId);
    case 'readarr':
      return (item.foreignAuthorId as string) || String(fallbackId);
    default:
      return String(fallbackId);
  }
}

/**
 * Fully syncs an instance: upsert instance, sync quality profiles, fetch media, convert tags.
 * Returns media with title and externalId already resolved so callers don't need to re-derive them.
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
  logger.debug(`📡 [${appType.charAt(0).toUpperCase() + appType.slice(1)} API] Fetching media`);
  const allMedia = await service.getMedia(instance);
  logger.debug('✅ [Scoutarr] Fetched all media from *arr API', { count: allMedia.length });

  // Convert tag IDs to names, normalize title and externalId
  const mediaWithTagNames = await convertMediaTagsToNames(service, instance, allMedia);
  const mediaWithTags = mediaWithTagNames.map(item => ({
    ...item,
    title: service.getMediaTitle(item as any),
    externalId: extractExternalId(appType, item as Record<string, unknown>, (item as any).id as number)
  }));

  return {
    mediaCount: allMedia.length,
    mediaWithTags
  };
}
