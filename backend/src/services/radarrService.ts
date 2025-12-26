import { RadarrInstance } from '@scoutarr/shared';
import { BaseStarrService } from './baseStarrService.js';
import logger from '../utils/logger.js';
import { applyCommonFilters, FilterableMedia } from '../utils/filterUtils.js';

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

  async getMovies(config: RadarrInstance): Promise<RadarrMovie[]> {
    try {
      const client = this.createClient(config);
      const response = await client.get<RadarrMovie[]>(`/api/${this.apiVersion}/${this.mediaEndpoint}`);
      return response.data;
    } catch (error: unknown) {
      this.logError('Failed to fetch movies', error, { url: config.url });
      throw error;
    }
  }

  async searchMovies(config: RadarrInstance, movieIds: number[]): Promise<void> {
    try {
      const client = this.createClient(config);
      await client.post(`/api/${this.apiVersion}/command`, {
        name: 'MoviesSearch',
        movieIds: movieIds
      });
    } catch (error: unknown) {
      this.logError('Failed to search movies', error, { movieIds });
      throw error;
    }
  }

  // Implement abstract methods
  async getMedia(config: RadarrInstance): Promise<RadarrMovie[]> {
    return this.getMovies(config);
  }

  async searchMedia(config: RadarrInstance, mediaIds: number[]): Promise<void> {
    return this.searchMovies(config, mediaIds);
  }

  async filterMovies(config: RadarrInstance, movies: RadarrMovie[]): Promise<RadarrMovie[]> {
    try {
      // Apply common filters (monitored, tag, quality profile, ignore tag)
      let filtered = await applyCommonFilters(
        movies,
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

      // Filter by movie status (skip when set to "any")
      // Radarr has special status mapping
      if (config.movieStatus && config.movieStatus !== 'any') {
        const before = filtered.length;
        filtered = filtered.filter(m => {
          if (config.movieStatus === 'released') {
            return m.status === 'released';
          } else if (config.movieStatus === 'in cinemas') {
            return m.status === 'inCinemas';
          } else if (config.movieStatus === 'announced') {
            return m.status === 'announced';
          }
          return true;
        });
      }

      return filtered;
    } catch (error: unknown) {
      this.logError('Failed to filter movies', error);
      throw error;
    }
  }

  async filterMedia(config: RadarrInstance, media: RadarrMovie[]): Promise<RadarrMovie[]> {
    return this.filterMovies(config, media);
  }

}

export const radarrService = new RadarrService();
