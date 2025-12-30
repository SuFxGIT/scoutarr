import { SonarrInstance } from '@scoutarr/shared';
import { BaseStarrService } from './baseStarrService.js';
import logger from '../utils/logger.js';
import { applyCommonFilters, FilterableMedia } from '../utils/filterUtils.js';
import { fetchCustomFormatScores } from '../utils/customFormatUtils.js';

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
      logger.debug('📡 [Sonarr API] Fetching series', { url: config.url });
      const response = await client.get<SonarrSeries[]>(`/api/${this.apiVersion}/${this.mediaEndpoint}`);
      const series = response.data;
      logger.debug('📡 [Sonarr API] Fetched series', { count: series.length });

      // Sonarr's /api/v3/series endpoint doesn't include customFormatScore in episodeFile
      // We need to fetch episode files separately to get custom format scores
      const episodeFileIds = series
        .map(s => (s as { episodeFile?: { id?: number } }).episodeFile?.id)
        .filter((id): id is number => id !== undefined && id > 0);

      const fileScoresMap = await fetchCustomFormatScores({
        client,
        apiVersion: this.apiVersion,
        endpoint: 'episodefile',
        paramName: 'episodeFileIds',
        fileIds: episodeFileIds,
        appName: this.appName
      });

      // Add customFormatScore to each series' episodeFile
      return series.map(s => {
        const episodeFile = (s as { episodeFile?: { id?: number } }).episodeFile;
        if (episodeFile?.id && fileScoresMap.has(episodeFile.id)) {
          return {
            ...s,
            episodeFile: {
              ...episodeFile,
              customFormatScore: fileScoresMap.get(episodeFile.id)
            }
          } as SonarrSeries;
        }
        return s;
      });
    } catch (error: unknown) {
      this.logError('Failed to fetch series', error, { url: config.url });
      throw error;
    }
  }

  async searchSeries(config: SonarrInstance, seriesId: number): Promise<void> {
    try {
      const client = this.createClient(config);
      // Sonarr only supports searching one series at a time
      logger.debug('📡 [Sonarr API] Starting series search', { seriesId });
      await client.post(`/api/${this.apiVersion}/command`, {
        name: 'SeriesSearch',
        seriesId
      });
      logger.debug('📡 [Sonarr API] Series search command sent', { seriesId });
    } catch (error: unknown) {
      this.logError('Failed to search series', error, { seriesId });
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
        filtered = filtered.filter(s => s.status === config.seriesStatus);
        logger.debug('🔽 Filtered by series status', {
          count: filtered.length,
          status: config.seriesStatus
        });
      }

      return filtered;
    } catch (error: unknown) {
      this.logError('Failed to filter series', error);
      throw error;
    }
  }

  async filterMedia(config: SonarrInstance, media: SonarrSeries[]): Promise<SonarrSeries[]> {
    return this.filterSeries(config, media);
  }

}

export const sonarrService = new SonarrService();
