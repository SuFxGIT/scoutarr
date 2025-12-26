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
  logger.debug(`🔽 Starting common filters for ${appName}`, { 
    initialCount: media.length,
    mediaType: mediaTypeName,
    monitored: config.monitored,
    tagName: config.tagName,
    qualityProfile: config.qualityProfileName || 'none',
    ignoreTag: config.ignoreTag || 'none'
  });
  
  let filtered = media;

  // Filter by monitored status
  if (config.monitored !== undefined) {
    const before = filtered.length;
    filtered = filtered.filter(m => m.monitored === config.monitored);
    logger.debug('🔽 Filtered by monitored status', { 
      before, 
      after: filtered.length, 
      monitored: config.monitored,
      removed: before - filtered.length
    });
  }

  // Get tag ID for filtering - always only include media WITHOUT the tag for primary selection.
  // Unattended mode behavior (removing tags and re-filtering when no media
  // is found) is handled at the scheduler layer, not here.
  logger.debug('🏷️  Getting tag ID for filtering', { tagName: config.tagName });
  const tagId = await config.getTagId(config.tagName);
  if (tagId !== null) {
    const before = filtered.length;
    filtered = filtered.filter(m => !m.tags.includes(tagId));
    logger.debug(`🔽 Filtered out already tagged ${mediaTypeName}`, { 
      before, 
      after: filtered.length, 
      tagName: config.tagName,
      tagId,
      removed: before - filtered.length
    });
  } else {
    logger.debug('⚠️  Tag not found, skipping tag filter', { tagName: config.tagName });
  }

  // Filter by quality profile
  if (config.qualityProfileName) {
    logger.debug('📋 Getting quality profiles for filtering', { profileName: config.qualityProfileName });
    const profiles = await config.getQualityProfiles();
    const profile = profiles.find(p => p.name === config.qualityProfileName);
    if (profile) {
      const before = filtered.length;
      filtered = filtered.filter(m => m.qualityProfileId === profile.id);
      logger.debug('🔽 Filtered by quality profile', { 
        before, 
        after: filtered.length, 
        profile: config.qualityProfileName,
        profileId: profile.id,
        removed: before - filtered.length
      });
    } else {
      logger.warn('⚠️  Quality profile not found, skipping profile filter', { 
        profileName: config.qualityProfileName,
        availableProfiles: profiles.map(p => p.name)
      });
    }
  }

  // Filter out media with ignore tag
  if (config.ignoreTag) {
    logger.debug('🏷️  Getting ignore tag ID', { ignoreTag: config.ignoreTag });
    const ignoreTagId = await config.getTagId(config.ignoreTag);
    if (ignoreTagId !== null) {
      const before = filtered.length;
      filtered = filtered.filter(m => !m.tags.includes(ignoreTagId));
      logger.debug('🔽 Filtered out ignore tag', { 
        before, 
        after: filtered.length, 
        ignoreTag: config.ignoreTag,
        ignoreTagId,
        removed: before - filtered.length
      });
    } else {
      logger.debug('⚠️  Ignore tag not found, skipping ignore tag filter', { ignoreTag: config.ignoreTag });
    }
  }

  logger.debug(`✅ Common filters completed for ${appName}`, {
    initialCount: media.length,
    finalCount: filtered.length,
    removed: media.length - filtered.length
  });

  return filtered;
}

