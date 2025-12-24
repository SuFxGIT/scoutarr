import { AxiosInstance } from 'axios';
import { ReadarrInstance } from '../types/config.js';
import { StarrQualityProfile } from '../types/starr.js';
import { createStarrClient, getOrCreateTagId } from '../utils/starrUtils.js';
import logger from '../utils/logger.js';

export interface ReadarrAuthor {
  id: number;
  authorName: string;
  title?: string; // Alias for authorName for consistency
  status: string;
  monitored: boolean;
  tags: number[];
  qualityProfileId: number;
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
      let filtered = authors;

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
        logger.debug('🔽 Filtered out already tagged authors', { 
          before, 
          after: filtered.length, 
          tagName: config.tagName 
        });
      }

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

      // Filter out authors with ignore tag
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
      logger.error('❌ Failed to filter authors', { error: error.message });
      throw error;
    }
  }
}

export const readarrService = new ReadarrService();

