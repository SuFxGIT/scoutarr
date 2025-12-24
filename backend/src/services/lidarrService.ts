import { AxiosInstance } from 'axios';
import { LidarrInstance } from '../types/config.js';
import { StarrQualityProfile } from '../types/starr.js';
import { createStarrClient, getOrCreateTagId } from '../utils/starrUtils.js';
import logger from '../utils/logger.js';
import { applyCommonFilters, FilterableMedia } from '../utils/filterUtils.js';

export interface LidarrArtist extends FilterableMedia {
  artistName: string;
  title?: string; // Alias for artistName for consistency
}

class LidarrService {
  private createClient(config: LidarrInstance): AxiosInstance {
    return createStarrClient(config.url, config.apiKey);
  }

  async getArtists(config: LidarrInstance): Promise<LidarrArtist[]> {
    try {
      const client = this.createClient(config);
      const response = await client.get<LidarrArtist[]>('/api/v1/artist');
      // Normalize artistName to title for consistency
      const artists = response.data.map(artist => ({
        ...artist,
        title: artist.artistName || artist.title
      }));
      logger.debug('📥 Fetched artists from Lidarr', { count: artists.length, url: config.url });
      return artists;
    } catch (error: any) {
      logger.error('❌ Failed to fetch artists from Lidarr', { 
        error: error.message,
        url: config.url 
      });
      throw error;
    }
  }

  async getQualityProfiles(config: LidarrInstance): Promise<StarrQualityProfile[]> {
    try {
      const client = this.createClient(config);
      const response = await client.get<StarrQualityProfile[]>('/api/v1/qualityprofile');
      return response.data;
    } catch (error: any) {
      logger.error('❌ Failed to fetch quality profiles from Lidarr', { error: error.message });
      throw error;
    }
  }

  async searchArtists(config: LidarrInstance, artistId: number): Promise<void> {
    try {
      const client = this.createClient(config);
      // Lidarr only supports searching one artist at a time
      await client.post(`/api/v1/command`, {
        name: 'ArtistSearch',
        artistId
      });
      logger.debug('🔎 Triggered search for artist', { artistId });
    } catch (error: any) {
      logger.error('❌ Failed to search artist in Lidarr', { error: error.message, artistId });
      throw error;
    }
  }

  async addTagToArtists(config: LidarrInstance, artistIds: number[], tagId: number): Promise<void> {
    try {
      const client = this.createClient(config);
      await client.put('/api/v1/artist/editor', {
        artistIds: artistIds,
        tags: [tagId],
        applyTags: 'add'
      });
      logger.debug('🏷️  Added tag to artists', { artistIds, tagId, count: artistIds.length });
    } catch (error: any) {
      logger.error('❌ Failed to add tag to artists in Lidarr', { error: error.message, artistIds, tagId });
      throw error;
    }
  }

  async removeTagFromArtists(config: LidarrInstance, artistIds: number[], tagId: number): Promise<void> {
    try {
      const client = this.createClient(config);
      await client.put('/api/v1/artist/editor', {
        artistIds: artistIds,
        tags: [tagId],
        applyTags: 'remove'
      });
      logger.debug('🏷️  Removed tag from artists', { artistIds, tagId, count: artistIds.length });
    } catch (error: any) {
      logger.error('❌ Failed to remove tag from artists in Lidarr', { error: error.message, artistIds, tagId });
      throw error;
    }
  }

  async getTagId(config: LidarrInstance, tagName: string): Promise<number | null> {
    const client = this.createClient(config);
    return getOrCreateTagId(client, tagName, 'Lidarr');
  }

  async filterArtists(config: LidarrInstance, artists: LidarrArtist[]): Promise<LidarrArtist[]> {
    try {
      // Apply common filters (monitored, tag, quality profile, ignore tag)
      let filtered = await applyCommonFilters(
        artists,
        {
          monitored: config.monitored,
          tagName: config.tagName,
          ignoreTag: config.ignoreTag,
          qualityProfileName: config.qualityProfileName,
          getQualityProfiles: () => this.getQualityProfiles(config),
          getTagId: (tagName: string) => this.getTagId(config, tagName)
        },
        'Lidarr',
        'artists'
      );

      // Filter by artist status
      if (config.artistStatus) {
        const before = filtered.length;
        filtered = filtered.filter(a => a.status === config.artistStatus);
        logger.debug('🔽 Filtered by artist status', { 
          before, 
          after: filtered.length, 
          status: config.artistStatus 
        });
      }

      return filtered;
    } catch (error: any) {
      logger.error('❌ Failed to filter artists', { error: error.message });
      throw error;
    }
  }
}

export const lidarrService = new LidarrService();

