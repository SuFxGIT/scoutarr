import { AxiosInstance } from 'axios';
import { RadarrInstance } from '../types/config.js';
import { StarrQualityProfile } from '../types/starr.js';
import { createStarrClient, getOrCreateTagId } from '../utils/starrUtils.js';
import logger from '../utils/logger.js';

export interface RadarrMovie {
  id: number;
  title: string;
  status: string;
  monitored: boolean;
  tags: number[];
  qualityProfileId: number;
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
      let filtered = movies;

      // Filter by monitored status
      if (config.monitored !== undefined) {
        const before = filtered.length;
        filtered = filtered.filter(m => m.monitored === config.monitored);
        logger.debug('🔽 Filtered by monitored status', { 
          before, 
          after: filtered.length, 
          monitored: config.monitored 
        });
      }

      // Get tag ID for filtering
      const tagId = await this.getTagId(config, config.tagName);
      if (tagId !== null) {
        const before = filtered.length;
        // Always only include media WITHOUT the tag for primary selection.
        // Unattended mode behavior (removing tags and re-filtering when no media
        // is found) is handled at the scheduler layer, not here.
        filtered = filtered.filter(m => !m.tags.includes(tagId));
        logger.debug('🔽 Filtered out already tagged movies', { 
          before, 
          after: filtered.length, 
          tagName: config.tagName 
        });
      }

      // Additional filters apply in both attended and unattended modes.
      // Unattended-specific behavior is handled by the scheduler when no media is found.

      // Filter by movie status (skip when set to "any")
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

      // Filter by quality profile
      if (config.qualityProfileName) {
        const profiles = await this.getQualityProfiles(config);
        const profile = profiles.find(p => p.name === config.qualityProfileName);
        if (profile) {
          const before = filtered.length;
          filtered = filtered.filter(m => m.qualityProfileId === profile.id);
          logger.debug('🔽 Filtered by quality profile', { 
            before, 
            after: filtered.length, 
            profile: config.qualityProfileName 
          });
        }
      }

      // Filter out movies with ignore tag
      if (config.ignoreTag) {
        const ignoreTagId = await this.getTagId(config, config.ignoreTag);
        if (ignoreTagId !== null) {
          const before = filtered.length;
          filtered = filtered.filter(m => !m.tags.includes(ignoreTagId));
          logger.debug('🔽 Filtered out ignore tag', { 
            before, 
            after: filtered.length, 
            ignoreTag: config.ignoreTag 
          });
        }
      }

      return filtered;
    } catch (error: any) {
      logger.error('❌ Failed to filter movies', { error: error.message });
      throw error;
    }
  }
}

export const radarrService = new RadarrService();
