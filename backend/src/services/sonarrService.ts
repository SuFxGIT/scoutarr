import { SonarrInstance } from '@scoutarr/shared';
import { BaseStarrService } from './baseStarrService.js';
import logger from '../utils/logger.js';
import { FilterableMedia } from '../utils/filterUtils.js';

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

  protected getFileIdField(): string {
    return 'episodeFile.id';
  }

  protected getFileEndpoint(): string {
    return 'episodefile';
  }

  protected getFileParamName(): string {
    return 'episodeFileIds';
  }

  protected getSearchCommandName(): string {
    return 'SeriesSearch';
  }

  protected getStatusFilterKey(): string {
    return 'seriesStatus';
  }

  protected extractFileIds(series: SonarrSeries[]): number[] {
    return series
      .map(s => (s as { episodeFile?: { id?: number } }).episodeFile?.id)
      .filter((id): id is number => id !== undefined && id > 0);
  }

  protected applyCustomFormatScores(series: SonarrSeries[], scoresMap: Map<number, number | undefined>): SonarrSeries[] {
    return series.map(s => {
      const episodeFile = (s as { episodeFile?: { id?: number } }).episodeFile;
      if (episodeFile?.id && scoresMap.has(episodeFile.id)) {
        return {
          ...s,
          episodeFile: {
            ...episodeFile,
            customFormatScore: scoresMap.get(episodeFile.id)
          }
        } as SonarrSeries;
      }
      return s;
    });
  }

  protected applyStatusFilter(series: SonarrSeries[], statusValue: string): SonarrSeries[] {
    return series.filter(s => s.status === statusValue);
  }

  async getSeries(config: SonarrInstance): Promise<SonarrSeries[]> {
    return this.fetchMediaWithScores(config);
  }

  async searchSeries(config: SonarrInstance, seriesId: number): Promise<void> {
    logger.info('🔍 [Sonarr API] Searching series', { name: config.name, seriesId });
    try {
      const client = this.createClient(config);
      await client.post(`/api/${this.apiVersion}/command`, {
        name: 'SeriesSearch',
        seriesId
      });
      logger.debug('✅ [Sonarr API] Search command sent', { seriesId });
    } catch (error: unknown) {
      this.logError('Failed to search series', error, { 
        seriesId,
        url: config.url,
        name: config.name
      });
      throw error;
    }
  }

  async filterSeries(config: SonarrInstance, series: SonarrSeries[]): Promise<SonarrSeries[]> {
    return this.filterMediaItems(config, series);
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

  async filterMedia(config: SonarrInstance, media: SonarrSeries[]): Promise<SonarrSeries[]> {
    return this.filterSeries(config, media);
  }
}

export const sonarrService = new SonarrService();
