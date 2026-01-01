import { RadarrInstance } from '@scoutarr/shared';
import { BaseStarrService } from './baseStarrService.js';
import logger from '../utils/logger.js';
import { FilterableMedia } from '../utils/filterUtils.js';

export interface RadarrMovie extends FilterableMedia {
  title: string;
}

class RadarrService extends BaseStarrService<RadarrInstance, RadarrMovie> {
  protected readonly appName = 'Radarr';
  protected readonly apiVersion = 'v3' as const;
  protected readonly mediaEndpoint = 'movie';
  protected readonly qualityProfileEndpoint = 'qualityprofile';
  protected readonly editorEndpoint = 'movie/editor';
  protected readonly mediaIdField = 'movieIds' as const;

  protected getMediaTypeName(): string {
    return 'movies';
  }

  protected getFileIdField(): string {
    return 'movieFile.id';
  }

  protected getFileEndpoint(): string {
    return 'moviefile';
  }

  protected getFileParamName(): string {
    return 'movieFileIds';
  }

  protected getSearchCommandName(): string {
    return 'MoviesSearch';
  }

  protected getStatusFilterKey(): string {
    return 'movieStatus';
  }

  protected extractFileIds(movies: RadarrMovie[]): number[] {
    return movies
      .map(m => (m as { movieFile?: { id?: number } }).movieFile?.id)
      .filter((id): id is number => id !== undefined && id > 0);
  }

  protected applyCustomFormatScores(movies: RadarrMovie[], scoresMap: Map<number, number | undefined>): RadarrMovie[] {
    return movies.map(movie => {
      const movieFile = (movie as { movieFile?: { id?: number } }).movieFile;
      if (movieFile?.id && scoresMap.has(movieFile.id)) {
        return {
          ...movie,
          movieFile: {
            ...movieFile,
            customFormatScore: scoresMap.get(movieFile.id)
          }
        } as RadarrMovie;
      }
      return movie;
    });
  }

  protected applyStatusFilter(movies: RadarrMovie[], statusValue: string): RadarrMovie[] {
    return movies.filter(m => {
      if (statusValue === 'released') {
        return m.status === 'released';
      } else if (statusValue === 'in cinemas') {
        return m.status === 'inCinemas';
      } else if (statusValue === 'announced') {
        return m.status === 'announced';
      }
      return true;
    });
  }

  async getMedia(config: RadarrInstance): Promise<RadarrMovie[]> {
    return this.fetchMediaWithScores(config);
  }

  async searchMedia(config: RadarrInstance, mediaIds: number[]): Promise<void> {
    return this.searchMediaItems(config, mediaIds, false);
  }

  async filterMedia(config: RadarrInstance, media: RadarrMovie[]): Promise<RadarrMovie[]> {
    return this.filterMediaItems(config, media);
  }
}

export const radarrService = new RadarrService();
