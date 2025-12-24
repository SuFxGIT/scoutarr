import logger from './logger.js';
import { StarrQualityProfile } from '../types/starr.js';

/**
 * Common interface for media items that can be filtered
 */
export interface FilterableMedia {
  id: number;
  monitored: boolean;
  tags: number[];
  qualityProfileId: number;
  status: string;
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

  // Get tag ID for filtering - always only include media WITHOUT the tag for primary selection.
  // Unattended mode behavior (removing tags and re-filtering when no media
  // is found) is handled at the scheduler layer, not here.
  const tagId = await config.getTagId(config.tagName);
  if (tagId !== null) {
    const before = filtered.length;
    filtered = filtered.filter(m => !m.tags.includes(tagId));
    logger.debug(`🔽 Filtered out already tagged ${mediaTypeName}`, { 
      before, 
      after: filtered.length, 
      tagName: config.tagName 
    });
  }

  // Filter by quality profile
  if (config.qualityProfileName) {
    const profiles = await config.getQualityProfiles();
    const profile = profiles.find(p => p.name === config.qualityProfileName);
    if (profile) {
      const before = filtered.length;
      filtered = filtered.filter(m => m.qualityProfileId === profile.id);
      logger.debug('🔽 Filtered by quality profile', { 
        before, 
        after: filtered.length, 
        profile: config.qualityProfileName 
      });
    }
  }

  // Filter out media with ignore tag
  if (config.ignoreTag) {
    const ignoreTagId = await config.getTagId(config.ignoreTag);
    if (ignoreTagId !== null) {
      const before = filtered.length;
      filtered = filtered.filter(m => !m.tags.includes(ignoreTagId));
      logger.debug('🔽 Filtered out ignore tag', { 
        before, 
        after: filtered.length, 
        ignoreTag: config.ignoreTag 
      });
    }
  }

  return filtered;
}

