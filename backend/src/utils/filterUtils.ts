import logger from './logger.js';
import { StarrQualityProfile } from '@scoutarr/shared';

/**
 * Common interface for media items that can be filtered
 */
export interface FilterableMedia {
  id: number;
  monitored: boolean;
  tags: number[];
  qualityProfileId: number;
  status: string;
  lastSearchTime?: string;
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
  }

  // Get tag ID for filtering - always only include media WITHOUT the tag for primary selection.
  // Unattended mode behavior (removing tags and re-filtering when no media
  // is found) is handled at the scheduler layer, not here.
  const tagId = await config.getTagId(config.tagName);
  if (tagId !== null) {
    filtered = filtered.filter(m => !m.tags.includes(tagId));
  }

  // Filter by quality profile
  if (config.qualityProfileName) {
    const profiles = await config.getQualityProfiles();
    const profile = profiles.find(p => p.name === config.qualityProfileName);
    if (profile) {
      filtered = filtered.filter(m => m.qualityProfileId === profile.id);
    } else {
      logger.warn('⚠️  Quality profile not found, skipping profile filter', { 
        profileName: config.qualityProfileName,
        availableProfiles: profiles.map(p => p.name)
      });
    }
  }

  // Filter out media with ignore tag
  if (config.ignoreTag) {
    const ignoreTagId = await config.getTagId(config.ignoreTag);
    if (ignoreTagId !== null) {
      filtered = filtered.filter(m => !m.tags.includes(ignoreTagId));
    }
  }

  return filtered;
}

