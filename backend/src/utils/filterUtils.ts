import logger from './logger.js';
import { StarrQualityProfile } from '@scoutarr/shared';

/**
 * Common interface for media items that can be filtered
 */
export interface FilterableMedia {
  id: number;
  monitored: boolean;
  tags: string[]; // Tag names, not IDs
  qualityProfileId?: number; // Profile ID from *arr API
  qualityProfileName?: string; // Profile name for filtering
  status: string;
  lastSearchTime?: string;
  added?: string;
  movieFile?: { dateAdded?: string }; // Date imported from *arr API
  episodeFile?: { dateAdded?: string }; // Date imported from *arr API
  trackFiles?: Array<{ dateAdded?: string }>; // Date imported from *arr API
  bookFiles?: Array<{ dateAdded?: string }>; // Date imported from *arr API
}

/**
 * Filter configuration for common filters
 */
interface CommonFilterConfig {
  monitored?: boolean;
  tagName: string;
  ignoreTag?: string;
  qualityProfileName?: string;
  getQualityProfiles: () => Promise<StarrQualityProfile[]>;
  getTagId: (tagName: string) => Promise<number | null>;
}

/**
 * Applies common filters to media items (monitored, tag, quality profile, ignore tag)
 */
export async function applyCommonFilters<T extends FilterableMedia>(
  media: T[],
  config: CommonFilterConfig,
  appName: string,
  mediaTypeName: string
): Promise<T[]> {
  // Ensure media is an array
  if (!Array.isArray(media)) {
    logger.error('❌ applyCommonFilters: media is not an array', { type: typeof media, media });
    return [];
  }
  
  let filtered = media;

  // Filter by monitored status
  if (config.monitored !== undefined) {
    const before = filtered.length;
    filtered = filtered.filter(m => m.monitored === config.monitored);
    logger.debug('🔽 Filtered by monitored status', {
      before,
      after: filtered.length,
      monitored: config.monitored
    });
  }

  // Filter by tag name - always only include media WITHOUT the tag for primary selection.
  // Unattended mode behavior (removing tags and re-filtering when no media
  // is found) is handled at the scheduler layer, not here.
  const tagName = config.tagName;
  if (tagName) {
    const before = filtered.length;
    filtered = filtered.filter(m => !m.tags.includes(tagName));
    logger.debug('🔽 Filtered by tag exclusion', {
      before,
      after: filtered.length,
      tagName,
      appName
    });
  }

  // Filter by quality profile name
  if (config.qualityProfileName) {
    const before = filtered.length;
    filtered = filtered.filter(m => m.qualityProfileName === config.qualityProfileName);
    logger.debug('🔽 Filtered by quality profile', {
      before,
      after: filtered.length,
      profileName: config.qualityProfileName,
      appName
    });
  }

  // Filter out media with ignore tag (by name)
  if (config.ignoreTag) {
    const ignoreTag = config.ignoreTag;
    const before = filtered.length;
    filtered = filtered.filter(m => !m.tags.includes(ignoreTag));
    logger.debug('🔽 Filtered by ignore tag', {
      before,
      after: filtered.length,
      ignoreTag,
      appName
    });
  }

  return filtered;
}

