import { AxiosInstance } from 'axios';
import { RadarrInstance } from '../types/config.js';
import { StarrQualityProfile } from '../types/starr.js';
import { createStarrClient, getOrCreateTagId } from '../utils/starrUtils.js';
import logger from '../utils/logger.js';
import { applyCommonFilters, FilterableMedia } from '../utils/filterUtils.js';

export interface RadarrMovie extends FilterableMedia {
  title: string;
}

class RadarrService {
  private createClient(config: RadarrInstance): AxiosInstance {
    return createStarrClient(config.url, config.apiKey);
  }

  async getMovies(config: RadarrInstance): Promise<RadarrMovie[]> {
    try {
      const client = this.createClient(config);
      const response = await client.get<RadarrMovie[]>('/api/v3/movie');
      logger.debug('📥 Fetched movies from Radarr', { count: response.data.length, url: config.url });
      return response.data;
    } catch (error: any) {
      logger.error('❌ Failed to fetch movies from Radarr', { 
        error: error.message,
        url: config.url 
      });
      throw error;
    }
  }

  async getQualityProfiles(config: RadarrInstance): Promise<StarrQualityProfile[]> {
    try {
      const client = this.createClient(config);
      const response = await client.get<StarrQualityProfile[]>('/api/v3/qualityprofile');
      return response.data;
    } catch (error: any) {
      logger.error('❌ Failed to fetch quality profiles from Radarr', { error: error.message });
      throw error;
    }
  }

  async searchMovies(config: RadarrInstance, movieIds: number[]): Promise<void> {
    try {
      const client = this.createClient(config);
      await client.post(`/api/v3/command`, {
        name: 'MoviesSearch',
        movieIds: movieIds
      });
      logger.debug('🔎 Triggered search for movies', { movieIds, count: movieIds.length });
    } catch (error: any) {
      logger.error('❌ Failed to search movies in Radarr', { error: error.message, movieIds });
      throw error;
    }
  }

  async addTagToMovies(config: RadarrInstance, movieIds: number[], tagId: number): Promise<void> {
    try {
      const client = this.createClient(config);
      await client.put('/api/v3/movie/editor', {
        movieIds: movieIds,
        tags: [tagId],
        applyTags: 'add'
      });
      logger.debug('🏷️  Added tag to movies', { movieIds, tagId, count: movieIds.length });
    } catch (error: any) {
      logger.error('❌ Failed to add tag to movies in Radarr', { error: error.message, movieIds, tagId });
      throw error;
    }
  }

  async removeTagFromMovies(config: RadarrInstance, movieIds: number[], tagId: number): Promise<void> {
    try {
      const client = this.createClient(config);
      await client.put('/api/v3/movie/editor', {
        movieIds: movieIds,
        tags: [tagId],
        applyTags: 'remove'
      });
      logger.debug('🏷️  Removed tag from movies', { movieIds, tagId, count: movieIds.length });
    } catch (error: any) {
      logger.error('❌ Failed to remove tag from movies in Radarr', { error: error.message, movieIds, tagId });
      throw error;
    }
  }

  async getTagId(config: RadarrInstance, tagName: string): Promise<number | null> {
    const client = this.createClient(config);
    return getOrCreateTagId(client, tagName, 'Radarr');
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
        'Radarr',
        'movies'
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
        logger.debug('🔽 Filtered by movie status', { 
          before, 
          after: filtered.length, 
          status: config.movieStatus 
        });
      }

      return filtered;
    } catch (error: any) {
      logger.error('❌ Failed to filter movies', { error: error.message });
      throw error;
    }
  }
}

export const radarrService = new RadarrService();
