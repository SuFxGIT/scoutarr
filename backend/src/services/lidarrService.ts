import { LidarrInstance } from '../types/config.js';
import { BaseStarrService } from './baseStarrService.js';
import logger from '../utils/logger.js';
import { applyCommonFilters, FilterableMedia } from '../utils/filterUtils.js';

export interface LidarrArtist extends FilterableMedia {
  artistName: string;
  title?: string; // Alias for artistName for consistency
}

class LidarrService extends BaseStarrService<LidarrInstance, LidarrArtist> {
  protected readonly appName = 'Lidarr';
  protected readonly apiVersion = 'v1' as const;
  protected readonly mediaEndpoint = 'artist';
  protected readonly qualityProfileEndpoint = 'qualityprofile';
  protected readonly editorEndpoint = 'artist/editor';
  protected readonly mediaIdField = 'artistIds' as const;

  protected getMediaTypeName(): string {
    return 'artists';
  }

  async getArtists(config: LidarrInstance): Promise<LidarrArtist[]> {
    try {
      const client = this.createClient(config);
      const response = await client.get<LidarrArtist[]>(`/api/${this.apiVersion}/${this.mediaEndpoint}`);
      // Normalize artistName to title for consistency
      const artists = response.data.map(artist => ({
        ...artist,
        title: artist.artistName || artist.title
      }));
      logger.debug('📥 Fetched artists from Lidarr', { count: artists.length, url: config.url });
      return artists;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('❌ Failed to fetch artists from Lidarr', { 
        error: errorMessage,
        url: config.url 
      });
      throw error;
    }
  }

  async searchArtists(config: LidarrInstance, artistId: number): Promise<void> {
    try {
      const client = this.createClient(config);
      // Lidarr only supports searching one artist at a time
      await client.post(`/api/${this.apiVersion}/command`, {
        name: 'ArtistSearch',
        artistId
      });
      logger.debug('🔎 Triggered search for artist', { artistId });
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('❌ Failed to search artist in Lidarr', { error: errorMessage, artistId });
      throw error;
    }
  }

  // Implement abstract methods
  async getMedia(config: LidarrInstance): Promise<LidarrArtist[]> {
    return this.getArtists(config);
  }

  async searchMedia(config: LidarrInstance, mediaIds: number[]): Promise<void> {
    // Lidarr only supports searching one artist at a time
    for (const artistId of mediaIds) {
      await this.searchArtists(config, artistId);
    }
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
        this.appName,
        this.getMediaTypeName()
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
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('❌ Failed to filter artists', { error: errorMessage });
      throw error;
    }
  }

  async filterMedia(config: LidarrInstance, media: LidarrArtist[]): Promise<LidarrArtist[]> {
    return this.filterArtists(config, media);
  }

  // Convenience methods for backward compatibility
  async addTagToArtists(config: LidarrInstance, artistIds: number[], tagId: number): Promise<void> {
    return this.addTag(config, artistIds, tagId);
  }

  async removeTagFromArtists(config: LidarrInstance, artistIds: number[], tagId: number): Promise<void> {
    return this.removeTag(config, artistIds, tagId);
  }
}

export const lidarrService = new LidarrService();
