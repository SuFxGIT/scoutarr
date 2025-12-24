import { AxiosInstance } from 'axios';
import { LidarrInstance } from '../types/config.js';
import { StarrTag, StarrQualityProfile } from '../types/starr.js';
import { createStarrClient, getOrCreateTagId } from '../utils/starrUtils.js';
import logger from '../utils/logger.js';

export interface LidarrArtist {
  id: number;
  artistName: string;
  title?: string; // Alias for artistName for consistency
  status: string;
  monitored: boolean;
  tags: number[];
  qualityProfileId: number;
}

// Re-export shared types for backward compatibility
export type LidarrTag = StarrTag;
export type LidarrQualityProfile = StarrQualityProfile;

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

  async filterArtists(config: LidarrInstance, artists: LidarrArtist[], unattended: boolean = false): Promise<LidarrArtist[]> {
    try {
      let filtered = artists;

      // Filter by monitored status
      if (config.monitored !== undefined) {
        const before = filtered.length;
        filtered = filtered.filter(a => a.monitored === config.monitored);
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
        filtered = filtered.filter(a => !a.tags.includes(tagId));
        logger.debug('🔽 Filtered out already tagged artists', { 
          before, 
          after: filtered.length, 
          tagName: config.tagName 
        });
      }

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

      // Filter by quality profile
      if (config.qualityProfileName) {
        const profiles = await this.getQualityProfiles(config);
        const profile = profiles.find(p => p.name === config.qualityProfileName);
        if (profile) {
          const before = filtered.length;
          filtered = filtered.filter(a => a.qualityProfileId === profile.id);
          logger.debug('🔽 Filtered by quality profile', { 
            before, 
            after: filtered.length, 
            profile: config.qualityProfileName 
          });
        }
      }

      // Filter out artists with ignore tag
      if (config.ignoreTag) {
        const ignoreTagId = await this.getTagId(config, config.ignoreTag);
        if (ignoreTagId !== null) {
          const before = filtered.length;
          filtered = filtered.filter(a => !a.tags.includes(ignoreTagId));
          logger.debug('🔽 Filtered out ignore tag', { 
            before, 
            after: filtered.length, 
            ignoreTag: config.ignoreTag 
          });
        }
      }

      return filtered;
    } catch (error: any) {
      logger.error('❌ Failed to filter artists', { error: error.message });
      throw error;
    }
  }
}

export const lidarrService = new LidarrService();

