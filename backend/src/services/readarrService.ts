import { ReadarrInstance } from '../types/config.js';
import { BaseStarrService } from './baseStarrService.js';
import logger from '../utils/logger.js';
import { applyCommonFilters, FilterableMedia } from '../utils/filterUtils.js';

export interface ReadarrAuthor extends FilterableMedia {
  authorName: string;
  title?: string; // Alias for authorName for consistency
}

class ReadarrService extends BaseStarrService<ReadarrInstance, ReadarrAuthor> {
  protected readonly appName = 'Readarr';
  protected readonly apiVersion = 'v1' as const;
  protected readonly mediaEndpoint = 'author';
  protected readonly qualityProfileEndpoint = 'qualityprofile';
  protected readonly editorEndpoint = 'author/editor';
  protected readonly mediaIdField = 'authorIds' as const;

  protected getMediaTypeName(): string {
    return 'authors';
  }

  async getAuthors(config: ReadarrInstance): Promise<ReadarrAuthor[]> {
    try {
      const client = this.createClient(config);
      const response = await client.get<ReadarrAuthor[]>(`/api/${this.apiVersion}/${this.mediaEndpoint}`);
      // Normalize authorName to title for consistency
      const authors = response.data.map(author => ({
        ...author,
        title: author.authorName || author.title
      }));
      logger.debug('📥 Fetched authors from Readarr', { count: authors.length, url: config.url });
      return authors;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('❌ Failed to fetch authors from Readarr', { 
        error: errorMessage,
        url: config.url 
      });
      throw error;
    }
  }

  async searchAuthors(config: ReadarrInstance, authorId: number): Promise<void> {
    try {
      const client = this.createClient(config);
      // Readarr only supports searching one author at a time
      await client.post(`/api/${this.apiVersion}/command`, {
        name: 'AuthorSearch',
        authorId
      });
      logger.debug('🔎 Triggered search for author', { authorId });
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('❌ Failed to search author in Readarr', { error: errorMessage, authorId });
      throw error;
    }
  }

  // Implement abstract methods
  async getMedia(config: ReadarrInstance): Promise<ReadarrAuthor[]> {
    return this.getAuthors(config);
  }

  async searchMedia(config: ReadarrInstance, mediaIds: number[]): Promise<void> {
    // Readarr only supports searching one author at a time
    for (const authorId of mediaIds) {
      await this.searchAuthors(config, authorId);
    }
  }

  async filterAuthors(config: ReadarrInstance, authors: ReadarrAuthor[]): Promise<ReadarrAuthor[]> {
    try {
      // Apply common filters (monitored, tag, quality profile, ignore tag)
      let filtered = await applyCommonFilters(
        authors,
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

      // Filter by author status
      if (config.authorStatus) {
        const before = filtered.length;
        filtered = filtered.filter(a => a.status === config.authorStatus);
        logger.debug('🔽 Filtered by author status', { 
          before, 
          after: filtered.length, 
          status: config.authorStatus 
        });
      }

      return filtered;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('❌ Failed to filter authors', { error: errorMessage });
      throw error;
    }
  }

  async filterMedia(config: ReadarrInstance, media: ReadarrAuthor[]): Promise<ReadarrAuthor[]> {
    return this.filterAuthors(config, media);
  }

  // Convenience methods for backward compatibility
  async addTagToAuthors(config: ReadarrInstance, authorIds: number[], tagId: number): Promise<void> {
    return this.addTag(config, authorIds, tagId);
  }

  async removeTagFromAuthors(config: ReadarrInstance, authorIds: number[], tagId: number): Promise<void> {
    return this.removeTag(config, authorIds, tagId);
  }
}

export const readarrService = new ReadarrService();
