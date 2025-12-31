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
    logger.info('📡 [Radarr API] Fetching movies', { url: config.url, name: config.name });
    try {
      const client = this.createClient(config);
      const response = await client.get<RadarrMovie[]>(`/api/${this.apiVersion}/${this.mediaEndpoint}`);
      const movies = response.data;

      // Radarr's /api/v3/movie endpoint doesn't include customFormatScore in movieFile
      // We need to fetch movie files separately to get custom format scores
      const movieFileIds = movies
        .map(m => (m as { movieFile?: { id?: number } }).movieFile?.id)
        .filter((id): id is number => id !== undefined && id > 0);

      logger.debug('🎬 [Radarr API] Extracting movie file IDs for custom format scores', { 
        movieFileCount: movieFileIds.length,
        totalMovies: movies.length
      });

      const fileScoresMap = await fetchCustomFormatScores({
        client,
        apiVersion: this.apiVersion,
        endpoint: 'moviefile',
        paramName: 'movieFileIds',
        fileIds: movieFileIds,
        appName: this.appName
      });

      logger.debug('✅ [Radarr API] Retrieved custom format scores', { 
        scoresFound: fileScoresMap.size,
        fileIdsRequested: movieFileIds.length
      });

      // Add customFormatScore to each movie's movieFile
      const moviesWithScores = movies.map(movie => {
        const movieFile = (movie as { movieFile?: { id?: number } }).movieFile;
        if (movieFile?.id && fileScoresMap.has(movieFile.id)) {
          return {
            ...movie,
            movieFile: {
              ...movieFile,
              customFormatScore: fileScoresMap.get(movieFile.id)
            }
          } as RadarrMovie;
        }
        return movie;
      });

      logger.info('✅ [Radarr API] Movie fetch completed', { 
        totalMovies: moviesWithScores.length,
        withCustomScores: moviesWithScores.filter(m => (m as any).movieFile?.customFormatScore !== undefined).length
      });

      return moviesWithScores;
    } catch (error: unknown) {
      this.logError('Failed to fetch movies', error, { url: config.url, name: config.name });
      throw error;
    }
  }

  async searchMovies(config: RadarrInstance, movieIds: number[]): Promise<void> {
    logger.info('🔍 [Radarr API] Searching movies', { 
      name: config.name,
      count: movieIds.length
    });
    try {
      const client = this.createClient(config);
      await client.post(`/api/${this.apiVersion}/command`, {
        name: 'MoviesSearch',
        movieIds: movieIds
      });
      logger.info('✅ [Radarr API] Search command sent', { count: movieIds.length });
    } catch (error: unknown) {
      this.logError('Failed to search movies', error, { 
        movieIds, 
        movieCount: movieIds.length,
        url: config.url,
        name: config.name
      });
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
    logger.info('🔽 [Radarr] Starting movie filtering', { 
      totalMovies: movies.length,
      name: config.name,
      filters: {
        monitored: config.monitored,
        tagName: config.tagName,
        ignoreTag: config.ignoreTag,
        qualityProfileName: config.qualityProfileName,
        movieStatus: config.movieStatus
      }
    });
    try {
      const initialCount = movies.length;

      // Apply common filters (monitored, tag, quality profile, ignore tag)
      logger.debug('🔽 [Radarr] Applying common filters', { count: movies.length });
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
      logger.debug('✅ [Radarr] Common filters applied', { 
        before: initialCount,
        after: filtered.length,
        removed: initialCount - filtered.length
      });

      // Filter by movie status (skip when set to "any")
      // Radarr has special status mapping
      if (config.movieStatus && config.movieStatus !== 'any') {
        const beforeStatusFilter = filtered.length;
        logger.debug('🔽 [Radarr] Applying movie status filter', { 
          movieStatus: config.movieStatus,
          count: beforeStatusFilter
        });
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
        logger.debug('✅ [Radarr] Movie status filter applied', {
          status: config.movieStatus,
          before: beforeStatusFilter,
          after: filtered.length,
          removed: beforeStatusFilter - filtered.length
        });
      } else {
        logger.debug('⏭️  [Radarr] Skipping movie status filter (set to any or undefined)');
      }

      logger.info('✅ [Radarr] Movie filtering completed', {
        initial: initialCount,
        final: filtered.length,
        totalRemoved: initialCount - filtered.length,
        filterEfficiency: `${((1 - filtered.length / initialCount) * 100).toFixed(1)}%`
      });

      return filtered;
    } catch (error: unknown) {
      this.logError('Failed to filter movies', error, { 
        movieCount: movies.length,
        name: config.name
      });
      throw error;
    }
  }

  async filterMedia(config: RadarrInstance, media: RadarrMovie[]): Promise<RadarrMovie[]> {
    return this.filterMovies(config, media);
  }

}

export const radarrService = new RadarrService();
