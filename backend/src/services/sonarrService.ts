import { AxiosInstance } from 'axios';
import { SonarrInstance } from '../types/config.js';
import { StarrQualityProfile } from '../types/starr.js';
import { createStarrClient, getOrCreateTagId } from '../utils/starrUtils.js';
import logger from '../utils/logger.js';
import { applyCommonFilters, FilterableMedia } from '../utils/filterUtils.js';

export interface SonarrSeries extends FilterableMedia {
  title: string;
}

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

  async filterSeries(config: SonarrInstance, series: SonarrSeries[]): Promise<SonarrSeries[]> {
    try {
      // Apply common filters (monitored, tag, quality profile, ignore tag)
      let filtered = await applyCommonFilters(
        series,
        {
          monitored: config.monitored,
          tagName: config.tagName,
          ignoreTag: config.ignoreTag,
          qualityProfileName: config.qualityProfileName,
          getQualityProfiles: () => this.getQualityProfiles(config),
          getTagId: (tagName: string) => this.getTagId(config, tagName)
        },
        'Sonarr',
        'series'
      );

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

      return filtered;
    } catch (error: any) {
      logger.error('❌ Failed to filter series', { error: error.message });
      throw error;
    }
  }
}

export const sonarrService = new SonarrService();

