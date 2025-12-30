import { RadarrInstance } from '@scoutarr/shared';
import { BaseStarrService } from './baseStarrService.js';
import logger from '../utils/logger.js';
import { applyCommonFilters, FilterableMedia } from '../utils/filterUtils.js';
import { fetchCustomFormatScores } from '../utils/customFormatUtils.js';

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
      logger.debug('📡 [Radarr API] Fetching movies', { url: config.url });
      const response = await client.get<RadarrMovie[]>(`/api/${this.apiVersion}/${this.mediaEndpoint}`);
      const movies = response.data;
      logger.debug('📡 [Radarr API] Fetched movies', { count: movies.length });

      // Radarr's /api/v3/movie endpoint doesn't include customFormatScore in movieFile
      // We need to fetch movie files separately to get custom format scores
      const movieFileIds = movies
        .map(m => (m as { movieFile?: { id?: number } }).movieFile?.id)
        .filter((id): id is number => id !== undefined && id > 0);

      const fileScoresMap = await fetchCustomFormatScores({
        client,
        apiVersion: this.apiVersion,
        endpoint: 'moviefile',
        paramName: 'movieFileIds',
        fileIds: movieFileIds,
        appName: this.appName,
        instanceId: `radarr-${config.url}`
      });

      // Add customFormatScore and dateAdded to each movie's movieFile
      return movies.map(movie => {
        const movieFile = (movie as { movieFile?: { id?: number } }).movieFile;
        if (movieFile?.id && fileScoresMap.has(movieFile.id)) {
          const fileData = fileScoresMap.get(movieFile.id);
          return {
            ...movie,
            movieFile: {
              ...movieFile,
              customFormatScore: fileData?.score,
              dateAdded: fileData?.dateAdded || (movieFile as { dateAdded?: string }).dateAdded
            }
          } as RadarrMovie;
        }
        return movie;
      });
    } catch (error: unknown) {
      this.logError('Failed to fetch movies', error, { url: config.url });
      throw error;
    }
  }

  async searchMovies(config: RadarrInstance, movieIds: number[]): Promise<void> {
    try {
      const client = this.createClient(config);
      logger.debug('📡 [Radarr API] Starting movie search', { count: movieIds.length });
      await client.post(`/api/${this.apiVersion}/command`, {
        name: 'MoviesSearch',
        movieIds: movieIds
      });
      logger.debug('📡 [Radarr API] Movie search command sent');
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
