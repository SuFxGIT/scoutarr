import { SonarrInstance } from '../types/config.js';
import { BaseStarrService } from './baseStarrService.js';
import logger from '../utils/logger.js';
import { applyCommonFilters, FilterableMedia } from '../utils/filterUtils.js';

export interface SonarrSeries extends FilterableMedia {
  title: string;
}

class SonarrService extends BaseStarrService<SonarrInstance, SonarrSeries> {
  protected readonly appName = 'Sonarr';
  protected readonly apiVersion = 'v3' as const;
  protected readonly mediaEndpoint = 'series';
  protected readonly qualityProfileEndpoint = 'qualityprofile';
  protected readonly editorEndpoint = 'series/editor';
  protected readonly mediaIdField = 'seriesIds' as const;

  protected getMediaTypeName(): string {
    return 'series';
  }

  async getSeries(config: SonarrInstance): Promise<SonarrSeries[]> {
    try {
      const client = this.createClient(config);
      const response = await client.get<SonarrSeries[]>(`/api/${this.apiVersion}/${this.mediaEndpoint}`);
      logger.debug('📥 Fetched series from Sonarr', { count: response.data.length, url: config.url });
      return response.data;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('❌ Failed to fetch series from Sonarr', { 
        error: errorMessage,
        url: config.url 
      });
      throw error;
    }
  }

  async searchSeries(config: SonarrInstance, seriesId: number): Promise<void> {
    try {
      const client = this.createClient(config);
      // Sonarr only supports searching one series at a time
      await client.post(`/api/${this.apiVersion}/command`, {
        name: 'SeriesSearch',
        seriesId
      });
      logger.debug('🔎 Triggered search for series', { seriesId });
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('❌ Failed to search series in Sonarr', { error: errorMessage, seriesId });
      throw error;
    }
  }

  // Implement abstract methods
  async getMedia(config: SonarrInstance): Promise<SonarrSeries[]> {
    return this.getSeries(config);
  }

  async searchMedia(config: SonarrInstance, mediaIds: number[]): Promise<void> {
    // Sonarr only supports searching one series at a time
    if (mediaIds.length > 0) {
      await this.searchSeries(config, mediaIds[0]);
    }
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
        this.appName,
        this.getMediaTypeName()
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
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('❌ Failed to filter series', { error: errorMessage });
      throw error;
    }
  }

  async filterMedia(config: SonarrInstance, media: SonarrSeries[]): Promise<SonarrSeries[]> {
    return this.filterSeries(config, media);
  }

  // Convenience methods for backward compatibility
  async addTagToSeries(config: SonarrInstance, seriesIds: number[], tagId: number): Promise<void> {
    return this.addTag(config, seriesIds, tagId);
  }

  async removeTagFromSeries(config: SonarrInstance, seriesIds: number[], tagId: number): Promise<void> {
    return this.removeTag(config, seriesIds, tagId);
  }
}

export const sonarrService = new SonarrService();
