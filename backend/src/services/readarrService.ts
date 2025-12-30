import { ReadarrInstance } from '@scoutarr/shared';
import { BaseStarrService } from './baseStarrService.js';
import logger from '../utils/logger.js';
import { applyCommonFilters, FilterableMedia } from '../utils/filterUtils.js';
import { fetchCustomFormatScores } from '../utils/customFormatUtils.js';

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
      logger.debug('📡 [Readarr API] Fetching authors', { url: config.url });
      const response = await client.get<ReadarrAuthor[]>(`/api/${this.apiVersion}/${this.mediaEndpoint}`);
      const authors = response.data.map(author => ({
        ...author,
        title: author.authorName || author.title
      }));
      logger.debug('📡 [Readarr API] Fetched authors', { count: authors.length });

      // Readarr's /api/v1/author endpoint doesn't include customFormatScore in bookFiles
      // We need to fetch book files separately to get custom format scores
      const bookFileIds: number[] = [];

      // Collect all book file IDs from all authors
      for (const author of authors) {
        const bookFiles = (author as { bookFiles?: Array<{ id?: number }> }).bookFiles;
        if (bookFiles && Array.isArray(bookFiles)) {
          bookFileIds.push(...bookFiles.map(f => f.id).filter((id): id is number => id !== undefined && id > 0));
        }
      }

      const fileScoresMap = await fetchCustomFormatScores({
        client,
        apiVersion: this.apiVersion,
        endpoint: 'bookfile',
        paramName: 'bookFileIds',
        fileIds: bookFileIds,
        appName: this.appName,
        instanceId: `readarr-${config.url}`
      });

      // Add customFormatScore and dateAdded to each author's bookFiles
      return authors.map(author => {
        const bookFiles = (author as { bookFiles?: Array<{ id?: number; dateAdded?: string }> }).bookFiles;
        if (bookFiles && Array.isArray(bookFiles) && bookFiles.length > 0) {
          const updatedBookFiles = bookFiles.map(bookFile => {
            if (bookFile.id && fileScoresMap.has(bookFile.id)) {
              const fileData = fileScoresMap.get(bookFile.id);
              return {
                ...bookFile,
                customFormatScore: fileData?.score,
                dateAdded: fileData?.dateAdded || bookFile.dateAdded
              };
            }
            return bookFile;
          });
          return {
            ...author,
            bookFiles: updatedBookFiles
          } as ReadarrAuthor;
        }
        return author;
      });
    } catch (error: unknown) {
      this.logError('Failed to fetch authors', error, { url: config.url });
      throw error;
    }
  }

  async searchAuthors(config: ReadarrInstance, authorId: number): Promise<void> {
    try {
      const client = this.createClient(config);
      // Readarr only supports searching one author at a time
      logger.debug('📡 [Readarr API] Starting author search', { authorId });
      await client.post(`/api/${this.apiVersion}/command`, {
        name: 'AuthorSearch',
        authorId
      });
      logger.debug('📡 [Readarr API] Author search command sent', { authorId });
    } catch (error: unknown) {
      this.logError('Failed to search author', error, { authorId });
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
        filtered = filtered.filter(a => a.status === config.authorStatus);
        logger.debug('🔽 Filtered by author status', {
          count: filtered.length,
          status: config.authorStatus
        });
      }

      return filtered;
    } catch (error: unknown) {
      this.logError('Failed to filter authors', error);
      throw error;
    }
  }

  async filterMedia(config: ReadarrInstance, media: ReadarrAuthor[]): Promise<ReadarrAuthor[]> {
    return this.filterAuthors(config, media);
  }

}

export const readarrService = new ReadarrService();
