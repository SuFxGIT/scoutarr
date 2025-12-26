import { AxiosInstance } from 'axios';
import { BaseStarrInstance, StarrQualityProfile } from '@scoutarr/shared';
import { createStarrClient, getOrCreateTagId } from '../utils/starrUtils.js';
import logger from '../utils/logger.js';
import { FilterableMedia } from '../utils/filterUtils.js';
import { getErrorMessage } from '../utils/errorUtils.js';

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
    return createStarrClient(config.url, config.apiKey);
  }

  /**
   * Helper for consistent error logging
   */
  protected logError(operation: string, error: unknown, context?: Record<string, unknown>): void {
    logger.error(`❌ ${operation} failed for ${this.appName}`, {
      error: getErrorMessage(error),
      ...context
    });
  }

  /**
   * Gets quality profiles from the Starr application
   */
  async getQualityProfiles(config: TConfig): Promise<StarrQualityProfile[]> {
    try {
      const client = this.createClient(config);
      const response = await client.get<StarrQualityProfile[]>(`/api/${this.apiVersion}/${this.qualityProfileEndpoint}`);
      return response.data;
    } catch (error: unknown) {
      this.logError('Failed to fetch quality profiles', error, { url: config.url });
      throw error;
    }
  }

  /**
   * Gets or creates a tag ID
   */
  async getTagId(config: TConfig, tagName: string): Promise<number | null> {
    const client = this.createClient(config);
    const tagId = await getOrCreateTagId(client, tagName, this.appName);
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
    } catch (error: unknown) {
      this.logError(`Failed to add tag to ${this.getMediaTypeName()}`, error, { mediaIds, tagId });
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
      this.logError(`Failed to remove tag from ${this.getMediaTypeName()}`, error, { mediaIds, tagId });
      throw error;
    }
  }

  /**
   * Gets the media type name for logging (movies, series, artists, authors)
   */
  protected abstract getMediaTypeName(): string;

  /**
   * Gets media ID from media object
   */
  getMediaId(media: TMedia): number {
    return media.id;
  }

  /**
   * Gets media title from media object
   */
  getMediaTitle(media: TMedia): string {
    return (media as any).title || (media as any).artistName || (media as any).authorName || 'Unknown';
  }

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

