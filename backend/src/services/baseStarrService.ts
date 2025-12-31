import { AxiosInstance } from 'axios';
import { BaseStarrInstance, StarrQualityProfile } from '@scoutarr/shared';
import { createStarrClient, getOrCreateTagId } from '../utils/starrUtils.js';
import logger from '../utils/logger.js';
import { FilterableMedia } from '../utils/filterUtils.js';
import { getErrorMessage, getErrorDetails } from '../utils/errorUtils.js';

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
    const { message, stack, name } = getErrorDetails(error);
    
    logger.error(`❌ ${operation} failed for ${this.appName}`, {
      error: message,
      errorName: name,
      stack,
      appName: this.appName,
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
      const profiles = response.data;
      logger.debug(`✅ [${this.appName}] Fetched ${profiles.length} quality profiles`);
      return profiles;
    } catch (error: unknown) {
      this.logError('Failed to fetch quality profiles', error, { url: config.url, endpoint: this.qualityProfileEndpoint });
      throw error;
    }
  }

  /**
   * Gets or creates a tag ID
   */
  async getTagId(config: TConfig, tagName: string): Promise<number | null> {
    const client = this.createClient(config);
    const tagId = await getOrCreateTagId(client, tagName, this.appName);
    if (!tagId) {
      logger.warn(`⚠️  [${this.appName}] Failed to get/create tag`, { tagName });
    }
    return tagId;
  }

  /**
   * Fetches all tags from the *arr API
   */
  async getAllTags(config: TConfig): Promise<Array<{ id: number; label: string }>> {
    try {
      const client = this.createClient(config);
      const response = await client.get<Array<{ id: number; label: string }>>(`/api/${this.apiVersion}/tag`);
      return response.data;
    } catch (error: unknown) {
      this.logError('Failed to fetch tags', error, { url: config.url });
      throw error;
    }
  }

  /**
   * Converts tag IDs to tag names
   */
  async convertTagIdsToNames(config: TConfig, tagIds: number[]): Promise<string[]> {
    if (tagIds.length === 0) {
      return [];
    }

    try {
      const allTags = await this.getAllTags(config);
      const tagMap = new Map(allTags.map(t => [t.id, t.label]));

      const tagNames = tagIds.map(id => {
        const tagName = tagMap.get(id);
        if (!tagName) {
          logger.warn(`⚠️  [${this.appName}] Unknown tag ID`, { tagId: id });
        }
        return tagName || `unknown-tag-${id}`;
      });
      
      return tagNames;
    } catch (error: unknown) {
      this.logError('Failed to convert tag IDs to names', error, { tagIds });
      // Return unknown tags as fallback
      return tagIds.map(id => `unknown-tag-${id}`);
    }
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
      logger.info(`✅ [${this.appName}] Added tag to ${mediaIds.length} ${this.getMediaTypeName()}`, { tagId, count: mediaIds.length });
    } catch (error: unknown) {
      this.logError(`Failed to add tag to ${this.getMediaTypeName()}`, error, { mediaIds, tagId, count: mediaIds.length });
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
      logger.info(`✅ [${this.appName}] Removed tag from ${mediaIds.length} ${this.getMediaTypeName()}`, { tagId, count: mediaIds.length });
    } catch (error: unknown) {
      this.logError(`Failed to remove tag from ${this.getMediaTypeName()}`, error, { mediaIds, tagId, count: mediaIds.length });
      throw error;
    }
  }

  /**
   * Gets the media type name for logging (movies, series, artists, authors)
   */
  protected abstract getMediaTypeName(): string;

  /**
   * Gets the file ID field name(s) for the specific media type
   */
  protected abstract getFileIdField(): string | string[];

  /**
   * Gets the file endpoint for custom format scores
   */
  protected abstract getFileEndpoint(): string;

  /**
   * Gets the file param name for batch fetching
   */
  protected abstract getFileParamName(): string;

  /**
   * Gets the search command name for the API
   */
  protected abstract getSearchCommandName(): string;

  /**
   * Extracts file IDs from media items
   */
  protected abstract extractFileIds(media: TMedia[]): number[];

  /**
   * Applies custom format scores to media items
   */
  protected abstract applyCustomFormatScores(media: TMedia[], scoresMap: Map<number, number | undefined>): TMedia[];

  /**
   * Gets status filter config key name
   */
  protected abstract getStatusFilterKey(): string | undefined;

  /**
   * Applies status filter to media
   */
  protected abstract applyStatusFilter(media: TMedia[], statusValue: string): TMedia[];

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
    const item = media as any;
    return item.title || item.artistName || item.authorName || 'Unknown';
  }

  /**
   * Generic method to fetch media with custom format scores
   * Eliminates duplication across all services
   */
  protected async fetchMediaWithScores(config: TConfig): Promise<TMedia[]> {
    logger.info(`📡 [${this.appName} API] Fetching ${this.getMediaTypeName()}`, { url: config.url, name: config.name });
    try {
      const client = this.createClient(config);
      const response = await client.get<TMedia[]>(`/api/${this.apiVersion}/${this.mediaEndpoint}`);
      const media = response.data;

      // Extract file IDs for custom format score fetching
      const fileIds = this.extractFileIds(media);
      
      if (fileIds.length > 0) {
        logger.debug(`📦 [${this.appName} API] Extracting file IDs for custom format scores`, {
          fileCount: fileIds.length,
          totalMedia: media.length
        });

        const { fetchCustomFormatScores } = await import('../utils/customFormatUtils.js');
        const fileScoresMap = await fetchCustomFormatScores({
          client,
          apiVersion: this.apiVersion,
          endpoint: this.getFileEndpoint(),
          paramName: this.getFileParamName(),
          fileIds,
          appName: this.appName
        });

        logger.debug(`✅ [${this.appName} API] Retrieved custom format scores`, {
          scoresFound: fileScoresMap.size,
          fileIdsRequested: fileIds.length
        });

        const mediaWithScores = this.applyCustomFormatScores(media, fileScoresMap);

        logger.info(`✅ [${this.appName} API] Media fetch completed`, {
          total: mediaWithScores.length,
          withCustomScores: fileIds.length
        });

        return mediaWithScores;
      }

      logger.info(`✅ [${this.appName} API] Media fetch completed`, { total: media.length });
      return media;
    } catch (error: unknown) {
      this.logError(`Failed to fetch ${this.getMediaTypeName()}`, error, { url: config.url, name: config.name });
      throw error;
    }
  }

  /**
   * Generic method to search media
   * Handles both single and batch search commands
   */
  protected async searchMediaItems(config: TConfig, mediaIds: number[], searchOneByOne: boolean = false): Promise<void> {
    const commandName = this.getSearchCommandName();
    logger.info(`🔍 [${this.appName} API] Searching ${this.getMediaTypeName()}`, {
      name: config.name,
      count: mediaIds.length
    });
    
    try {
      const client = this.createClient(config);
      
      if (searchOneByOne) {
        // For apps that only support one-at-a-time search
        for (const mediaId of mediaIds) {
          await client.post(`/api/${this.apiVersion}/command`, {
            name: commandName,
            [this.mediaIdField.slice(0, -1)]: mediaId // Remove 's' from field name for single item
          });
        }
      } else {
        // For apps that support batch search (e.g., Radarr)
        await client.post(`/api/${this.apiVersion}/command`, {
          name: commandName,
          [this.mediaIdField]: mediaIds
        });
      }
      
      logger.info(`✅ [${this.appName} API] Search command sent`, { count: mediaIds.length });
    } catch (error: unknown) {
      this.logError(`Failed to search ${this.getMediaTypeName()}`, error, {
        mediaIds,
        mediaCount: mediaIds.length,
        url: config.url,
        name: config.name
      });
      throw error;
    }
  }

  /**
   * Generic method to filter media
   * Applies common filters and optional status filter
   */
  protected async filterMediaItems(config: TConfig, media: TMedia[]): Promise<TMedia[]> {
    logger.info(`🔽 [${this.appName}] Starting ${this.getMediaTypeName()} filtering`, {
      totalMedia: media.length,
      name: config.name,
      filters: {
        monitored: (config as any).monitored,
        tagName: (config as any).tagName,
        ignoreTag: (config as any).ignoreTag,
        qualityProfileName: (config as any).qualityProfileName,
        statusFilter: (config as any)[this.getStatusFilterKey() || '']
      }
    });
    
    try {
      const initialCount = media.length;
      const { applyCommonFilters } = await import('../utils/filterUtils.js');

      // Apply common filters (monitored, tag, quality profile, ignore tag)
      logger.debug(`🔽 [${this.appName}] Applying common filters`, { count: media.length });
      let filtered = await applyCommonFilters(
        media,
        {
          monitored: (config as any).monitored,
          tagName: (config as any).tagName,
          ignoreTag: (config as any).ignoreTag,
          qualityProfileName: (config as any).qualityProfileName,
          getQualityProfiles: () => this.getQualityProfiles(config),
          getTagId: (tagName: string) => this.getTagId(config, tagName)
        },
        this.appName,
        this.getMediaTypeName()
      );
      
      logger.debug(`✅ [${this.appName}] Common filters applied`, {
        before: initialCount,
        after: filtered.length,
        removed: initialCount - filtered.length
      });

      // Apply status filter if configured
      const statusFilterKey = this.getStatusFilterKey();
      if (statusFilterKey) {
        const statusValue = (config as any)[statusFilterKey];
        if (statusValue && statusValue !== 'any') {
          const beforeStatusFilter = filtered.length;
          logger.debug(`🔽 [${this.appName}] Applying status filter`, {
            statusKey: statusFilterKey,
            statusValue,
            count: beforeStatusFilter
          });
          
          filtered = this.applyStatusFilter(filtered, statusValue);
          
          logger.debug(`✅ [${this.appName}] Status filter applied`, {
            status: statusValue,
            before: beforeStatusFilter,
            after: filtered.length,
            removed: beforeStatusFilter - filtered.length
          });
        } else {
          logger.debug(`⏭️  [${this.appName}] Skipping status filter (set to any or undefined)`);
        }
      }

      logger.info(`✅ [${this.appName}] Filtering completed`, {
        initial: initialCount,
        final: filtered.length,
        removed: initialCount - filtered.length,
        efficiency: `${((1 - filtered.length / initialCount) * 100).toFixed(1)}%`
      });

      return filtered;
    } catch (error: unknown) {
      this.logError(`Failed to filter ${this.getMediaTypeName()}`, error, {
        mediaCount: media.length,
        name: config.name
      });
      throw error;
    }
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

