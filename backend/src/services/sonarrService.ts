import { SonarrInstance } from '@scoutarr/shared';
import { BaseStarrService } from './baseStarrService.js';
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

  async getMedia(config: SonarrInstance): Promise<SonarrSeries[]> {
    return this.fetchMediaWithScores(config);
  }

  async searchMedia(config: SonarrInstance, mediaIds: number[]): Promise<void> {
    // Sonarr only supports searching one series at a time
    if (mediaIds.length > 0) {
      await this.searchMediaItems(config, [mediaIds[0]], true);
    }
  }

  async filterMedia(config: SonarrInstance, media: SonarrSeries[]): Promise<SonarrSeries[]> {
    return this.filterMediaItems(config, media);
  }
}

export const sonarrService = new SonarrService();
