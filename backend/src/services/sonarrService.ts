import { AxiosInstance } from 'axios';
import { SonarrInstance } from '../types/config.js';
import { StarrTag, StarrQualityProfile } from '../types/starr.js';
import { createStarrClient, getOrCreateTagId } from '../utils/starrUtils.js';
import logger from '../utils/logger.js';

export interface SonarrSeries {
  id: number;
  title: string;
  status: string;
  monitored: boolean;
  tags: number[];
  qualityProfileId: number;
}

// Re-export shared types for backward compatibility
export type SonarrTag = StarrTag;
export type SonarrQualityProfile = StarrQualityProfile;

class SonarrService {
  private createClient(config: SonarrInstance): AxiosInstance {
    return createStarrClient(config.url, config.apiKey);
  }

  async getSeries(config: SonarrInstance): Promise<SonarrSeries[]> {
    try {
      const client = this.createClient(config);
      const response = await client.get<SonarrSeries[]>('/api/v3/series');
      logger.debug('📥 Fetched series from Sonarr', { count: response.data.length, url: config.url });
      return response.data;
    } catch (error: any) {
      logger.error('❌ Failed to fetch series from Sonarr', { 
        error: error.message,
        url: config.url 
      });
      throw error;
    }
  }

  async getQualityProfiles(config: SonarrInstance): Promise<StarrQualityProfile[]> {
    try {
      const client = this.createClient(config);
      const response = await client.get<StarrQualityProfile[]>('/api/v3/qualityprofile');
      return response.data;
    } catch (error: any) {
      logger.error('❌ Failed to fetch quality profiles from Sonarr', { error: error.message });
      throw error;
    }
  }

  async searchSeries(config: SonarrInstance, seriesId: number): Promise<void> {
    try {
      const client = this.createClient(config);
      // Sonarr only supports searching one series at a time
      await client.post(`/api/v3/command`, {
        name: 'SeriesSearch',
        seriesId
      });
      logger.debug('🔎 Triggered search for series', { seriesId });
    } catch (error: any) {
      logger.error('❌ Failed to search series in Sonarr', { error: error.message, seriesId });
      throw error;
    }
  }

  async addTagToSeries(config: SonarrInstance, seriesIds: number[], tagId: number): Promise<void> {
    try {
      const client = this.createClient(config);
      await client.put('/api/v3/series/editor', {
        seriesIds: seriesIds,
        tags: [tagId],
        applyTags: 'add'
      });
      logger.debug('🏷️  Added tag to series', { seriesIds, tagId, count: seriesIds.length });
    } catch (error: any) {
      logger.error('❌ Failed to add tag to series in Sonarr', { error: error.message, seriesIds, tagId });
      throw error;
    }
  }

  async removeTagFromSeries(config: SonarrInstance, seriesIds: number[], tagId: number): Promise<void> {
    try {
      const client = this.createClient(config);
      await client.put('/api/v3/series/editor', {
        seriesIds: seriesIds,
        tags: [tagId],
        applyTags: 'remove'
      });
      logger.debug('🏷️  Removed tag from series', { seriesIds, tagId, count: seriesIds.length });
    } catch (error: any) {
      logger.error('❌ Failed to remove tag from series in Sonarr', { error: error.message, seriesIds, tagId });
      throw error;
    }
  }

  async getTagId(config: SonarrInstance, tagName: string): Promise<number | null> {
    const client = this.createClient(config);
    return getOrCreateTagId(client, tagName, 'Sonarr');
  }

  async filterSeries(config: SonarrInstance, series: SonarrSeries[], unattended: boolean = false): Promise<SonarrSeries[]> {
    try {
      let filtered = series;

      // Filter by monitored status
      if (config.monitored !== undefined) {
        const before = filtered.length;
        filtered = filtered.filter(s => s.monitored === config.monitored);
        logger.debug('🔽 Filtered by monitored status', { 
          before, 
          after: filtered.length, 
          monitored: config.monitored 
        });
      }

      // Get tag ID for filtering
      const tagId = await this.getTagId(config, config.tagName);
      if (tagId !== null) {
        const before = filtered.length;
        // Always only include media WITHOUT the tag for primary selection.
        // Unattended mode behavior (removing tags and re-filtering when no media
        // is found) is handled at the scheduler layer, not here.
        filtered = filtered.filter(s => !s.tags.includes(tagId));
        logger.debug('🔽 Filtered out already tagged series', { 
          before, 
          after: filtered.length, 
          tagName: config.tagName 
        });
      }

      // Additional filters apply in both attended and unattended modes.
      // Unattended-specific behavior is handled by the scheduler when no media is found.

      // Filter by series status
      if (config.seriesStatus) {
        const before = filtered.length;
        filtered = filtered.filter(s => s.status === config.seriesStatus);
        logger.debug('🔽 Filtered by series status', { 
          before, 
          after: filtered.length, 
          status: config.seriesStatus 
        });
      }

      // Filter by quality profile
      if (config.qualityProfileName) {
        const profiles = await this.getQualityProfiles(config);
        const profile = profiles.find(p => p.name === config.qualityProfileName);
        if (profile) {
          const before = filtered.length;
          filtered = filtered.filter(s => s.qualityProfileId === profile.id);
          logger.debug('🔽 Filtered by quality profile', { 
            before, 
            after: filtered.length, 
            profile: config.qualityProfileName 
          });
        }
      }

      // Filter out series with ignore tag
      if (config.ignoreTag) {
        const ignoreTagId = await this.getTagId(config, config.ignoreTag);
        if (ignoreTagId !== null) {
          const before = filtered.length;
          filtered = filtered.filter(s => !s.tags.includes(ignoreTagId));
          logger.debug('🔽 Filtered out ignore tag', { 
            before, 
            after: filtered.length, 
            ignoreTag: config.ignoreTag 
          });
        }
      }

      return filtered;
    } catch (error: any) {
      logger.error('❌ Failed to filter series', { error: error.message });
      throw error;
    }
  }
}

export const sonarrService = new SonarrService();

