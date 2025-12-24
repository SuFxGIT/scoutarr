import { AxiosInstance } from 'axios';
import { ReadarrInstance } from '../types/config.js';
import { StarrQualityProfile } from '../types/starr.js';
import { createStarrClient, getOrCreateTagId } from '../utils/starrUtils.js';
import logger from '../utils/logger.js';
import { applyCommonFilters, FilterableMedia } from '../utils/filterUtils.js';

export interface ReadarrAuthor extends FilterableMedia {
  authorName: string;
  title?: string; // Alias for authorName for consistency
}

class ReadarrService {
  private createClient(config: ReadarrInstance): AxiosInstance {
    return createStarrClient(config.url, config.apiKey);
  }

  async getAuthors(config: ReadarrInstance): Promise<ReadarrAuthor[]> {
    try {
      const client = this.createClient(config);
      const response = await client.get<ReadarrAuthor[]>('/api/v1/author');
      // Normalize authorName to title for consistency
      const authors = response.data.map(author => ({
        ...author,
        title: author.authorName || author.title
      }));
      logger.debug('📥 Fetched authors from Readarr', { count: authors.length, url: config.url });
      return authors;
    } catch (error: any) {
      logger.error('❌ Failed to fetch authors from Readarr', { 
        error: error.message,
        url: config.url 
      });
      throw error;
    }
  }

  async getQualityProfiles(config: ReadarrInstance): Promise<StarrQualityProfile[]> {
    try {
      const client = this.createClient(config);
      const response = await client.get<StarrQualityProfile[]>('/api/v1/qualityprofile');
      return response.data;
    } catch (error: any) {
      logger.error('❌ Failed to fetch quality profiles from Readarr', { error: error.message });
      throw error;
    }
  }

  async searchAuthors(config: ReadarrInstance, authorId: number): Promise<void> {
    try {
      const client = this.createClient(config);
      // Readarr only supports searching one author at a time
      await client.post(`/api/v1/command`, {
        name: 'AuthorSearch',
        authorId
      });
      logger.debug('🔎 Triggered search for author', { authorId });
    } catch (error: any) {
      logger.error('❌ Failed to search author in Readarr', { error: error.message, authorId });
      throw error;
    }
  }

  async addTagToAuthors(config: ReadarrInstance, authorIds: number[], tagId: number): Promise<void> {
    try {
      const client = this.createClient(config);
      await client.put('/api/v1/author/editor', {
        authorIds: authorIds,
        tags: [tagId],
        applyTags: 'add'
      });
      logger.debug('🏷️  Added tag to authors', { authorIds, tagId, count: authorIds.length });
    } catch (error: any) {
      logger.error('❌ Failed to add tag to authors in Readarr', { error: error.message, authorIds, tagId });
      throw error;
    }
  }

  async removeTagFromAuthors(config: ReadarrInstance, authorIds: number[], tagId: number): Promise<void> {
    try {
      const client = this.createClient(config);
      await client.put('/api/v1/author/editor', {
        authorIds: authorIds,
        tags: [tagId],
        applyTags: 'remove'
      });
      logger.debug('🏷️  Removed tag from authors', { authorIds, tagId, count: authorIds.length });
    } catch (error: any) {
      logger.error('❌ Failed to remove tag from authors in Readarr', { error: error.message, authorIds, tagId });
      throw error;
    }
  }

  async getTagId(config: ReadarrInstance, tagName: string): Promise<number | null> {
    const client = this.createClient(config);
    return getOrCreateTagId(client, tagName, 'Readarr');
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
        'Readarr',
        'authors'
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
    } catch (error: any) {
      logger.error('❌ Failed to filter authors', { error: error.message });
      throw error;
    }
  }
}

export const readarrService = new ReadarrService();

