import { AxiosInstance } from 'axios';
import { BaseStarrInstance } from '../types/starr.js';
import { StarrQualityProfile } from '../types/starr.js';
import { createStarrClient, getOrCreateTagId } from '../utils/starrUtils.js';
import logger from '../utils/logger.js';
import { FilterableMedia } from '../utils/filterUtils.js';

/**
 * Base class for Starr application services
 * Provides common functionality shared across Radarr, Sonarr, Lidarr, and Readarr
 */
export abstract class BaseStarrService<TConfig extends BaseStarrInstance, TMedia extends FilterableMedia> {
  protected abstract readonly appName: string;
  protected abstract readonly apiVersion: 'v1' | 'v3';
  protected abstract readonly mediaEndpoint: string;
  protected abstract readonly qualityProfileEndpoint: string;
  protected abstract readonly editorEndpoint: string;
  protected abstract readonly mediaIdField: 'movieIds' | 'seriesIds' | 'artistIds' | 'authorIds';

  /**
   * Creates an axios client for API calls
   */
  protected createClient(config: TConfig): AxiosInstance {
    logger.debug(`🔌 Creating ${this.appName} API client`, { url: config.url });
    return createStarrClient(config.url, config.apiKey);
  }

  /**
   * Gets quality profiles from the Starr application
   */
  async getQualityProfiles(config: TConfig): Promise<StarrQualityProfile[]> {
    logger.debug(`📋 Fetching quality profiles from ${this.appName}`, { 
      url: config.url,
      apiVersion: this.apiVersion,
      endpoint: this.qualityProfileEndpoint
    });
    try {
      const client = this.createClient(config);
      const response = await client.get<StarrQualityProfile[]>(`/api/${this.apiVersion}/${this.qualityProfileEndpoint}`);
      logger.debug(`✅ Fetched quality profiles from ${this.appName}`, { 
        count: response.data.length,
        profiles: response.data.map(p => p.name)
      });
      return response.data;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`❌ Failed to fetch quality profiles from ${this.appName}`, { 
        error: errorMessage,
        url: config.url
      });
      throw error;
    }
  }

  /**
   * Gets or creates a tag ID
   */
  async getTagId(config: TConfig, tagName: string): Promise<number | null> {
    logger.debug(`🏷️  Getting/creating tag ID for ${this.appName}`, { tagName, url: config.url });
    const client = this.createClient(config);
    const tagId = await getOrCreateTagId(client, tagName, this.appName);
    logger.debug(`✅ Tag ID retrieved/created for ${this.appName}`, { tagName, tagId });
    return tagId;
  }

  /**
   * Adds a tag to media items
   */
  async addTag(config: TConfig, mediaIds: number[], tagId: number): Promise<void> {
    try {
      const client = this.createClient(config);
      await client.put(`/api/${this.apiVersion}/${this.editorEndpoint}`, {
        [this.mediaIdField]: mediaIds,
        tags: [tagId],
        applyTags: 'add'
      });
      logger.debug(`🏷️  Added tag to ${this.getMediaTypeName()}`, { 
        mediaIds, 
        tagId, 
        count: mediaIds.length 
      });
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`❌ Failed to add tag to ${this.getMediaTypeName()} in ${this.appName}`, { 
        error: errorMessage, 
        mediaIds, 
        tagId 
      });
      throw error;
    }
  }

  /**
   * Removes a tag from media items
   */
  async removeTag(config: TConfig, mediaIds: number[], tagId: number): Promise<void> {
    try {
      const client = this.createClient(config);
      await client.put(`/api/${this.apiVersion}/${this.editorEndpoint}`, {
        [this.mediaIdField]: mediaIds,
        tags: [tagId],
        applyTags: 'remove'
      });
      logger.debug(`🏷️  Removed tag from ${this.getMediaTypeName()}`, { 
        mediaIds, 
        tagId, 
        count: mediaIds.length 
      });
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`❌ Failed to remove tag from ${this.getMediaTypeName()} in ${this.appName}`, { 
        error: errorMessage, 
        mediaIds, 
        tagId 
      });
      throw error;
    }
  }

  /**
   * Gets the media type name for logging (movies, series, artists, authors)
   */
  protected abstract getMediaTypeName(): string;

  /**
   * Fetches all media items from the Starr application
   * Must be implemented by each service
   */
  abstract getMedia(config: TConfig): Promise<TMedia[]>;

  /**
   * Filters media items based on configuration
   * Must be implemented by each service for app-specific status filtering
   */
  abstract filterMedia(config: TConfig, media: TMedia[]): Promise<TMedia[]>;

  /**
   * Searches for media items
   * Must be implemented by each service for app-specific search logic
   */
  abstract searchMedia(config: TConfig, mediaIds: number[]): Promise<void>;
}

