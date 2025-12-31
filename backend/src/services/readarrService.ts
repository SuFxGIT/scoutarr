import { ReadarrInstance } from '@scoutarr/shared';
import { BaseStarrService } from './baseStarrService.js';
import logger from '../utils/logger.js';
import { applyCommonFilters, FilterableMedia } from '../utils/filterUtils.js';
import { fetchCustomFormatScores } from '../utils/customFormatUtils.js';

export interface ReadarrAuthor extends FilterableMedia {
  authorName: string;
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
    logger.info('📡 [Readarr API] Fetching authors', { url: config.url, name: config.name });
    try {
      const client = this.createClient(config);
      const response = await client.get<ReadarrAuthor[]>(`/api/${this.apiVersion}/${this.mediaEndpoint}`);
      const authors = response.data;

      // Readarr's /api/v1/author endpoint doesn't include customFormatScore in bookFiles
      // We need to fetch book files separately to get custom format scores
      const bookFileIds: number[] = [];

      // Collect all book file IDs from all authors
      logger.debug('📚 [Readarr API] Collecting book file IDs from authors');
      for (const author of authors) {
        const bookFiles = (author as { bookFiles?: Array<{ id?: number }> }).bookFiles;
        if (bookFiles && Array.isArray(bookFiles)) {
          bookFileIds.push(...bookFiles.map(f => f.id).filter((id): id is number => id !== undefined && id > 0));
        }
      }

      logger.debug('📚 [Readarr API] Extracting book file IDs for custom format scores', { 
        bookFileCount: bookFileIds.length,
        totalAuthors: authors.length
      });

      const fileScoresMap = await fetchCustomFormatScores({
        client,
        apiVersion: this.apiVersion,
        endpoint: 'bookfile',
        paramName: 'bookFileIds',
        fileIds: bookFileIds,
        appName: this.appName
      });

      logger.debug('✅ [Readarr API] Retrieved custom format scores', { 
        scoresFound: fileScoresMap.size,
        fileIdsRequested: bookFileIds.length
      });

      // Add customFormatScore to each author's bookFiles
      const authorsWithScores = authors.map(author => {
        const bookFiles = (author as { bookFiles?: Array<{ id?: number }> }).bookFiles;
        if (bookFiles && Array.isArray(bookFiles) && bookFiles.length > 0) {
          const updatedBookFiles = bookFiles.map(bookFile => {
            if (bookFile.id && fileScoresMap.has(bookFile.id)) {
              return {
                ...bookFile,
                customFormatScore: fileScoresMap.get(bookFile.id)
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

      logger.info('✅ [Readarr API] Author fetch completed', { 
        totalAuthors: authorsWithScores.length,
        totalBookFiles: bookFileIds.length,
        withCustomScores: fileScoresMap.size
      });

      return authorsWithScores;
    } catch (error: unknown) {
      this.logError('Failed to fetch authors', error, { url: config.url, name: config.name });
      throw error;
    }
  }

  async searchAuthors(config: ReadarrInstance, authorId: number): Promise<void> {
    logger.info('🔍 [Readarr API] Searching author', { name: config.name, authorId });
    try {
      const client = this.createClient(config);
      await client.post(`/api/${this.apiVersion}/command`, {
        name: 'AuthorSearch',
        authorId
      });
      logger.debug('✅ [Readarr API] Search command sent', { authorId });
    } catch (error: unknown) {
      this.logError('Failed to search author', error, { 
        authorId,
        url: config.url,
        name: config.name
      });
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
    logger.info('🔽 [Readarr] Starting author filtering', { 
      totalAuthors: authors.length,
      name: config.name,
      filters: {
        monitored: config.monitored,
        tagName: config.tagName,
        ignoreTag: config.ignoreTag,
        qualityProfileName: config.qualityProfileName,
        authorStatus: config.authorStatus
      }
    });
    try {
      const initialCount = authors.length;

      // Apply common filters (monitored, tag, quality profile, ignore tag)
      logger.debug('🔽 [Readarr] Applying common filters', { count: authors.length });
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
      logger.debug('✅ [Readarr] Common filters applied', { 
        before: initialCount,
        after: filtered.length,
        removed: initialCount - filtered.length
      });

      // Filter by author status
      if (config.authorStatus) {
        const beforeStatusFilter = filtered.length;
        logger.debug('🔽 [Readarr] Applying author status filter', { 
          authorStatus: config.authorStatus,
          count: beforeStatusFilter
        });
        filtered = filtered.filter(a => a.status === config.authorStatus);
        logger.debug('✅ [Readarr] Author status filter applied', {
          status: config.authorStatus,
          before: beforeStatusFilter,
          after: filtered.length,
          removed: beforeStatusFilter - filtered.length
        });
      } else {
        logger.debug('⏭️  [Readarr] Skipping author status filter (not configured)');
      }

      logger.info('✅ [Readarr] Author filtering completed', {
        initial: initialCount,
        final: filtered.length,
        totalRemoved: initialCount - filtered.length,
        filterEfficiency: `${((1 - filtered.length / initialCount) * 100).toFixed(1)}%`
      });

      return filtered;
    } catch (error: unknown) {
      this.logError('Failed to filter authors', error, { 
        authorCount: authors.length,
        name: config.name
      });
      throw error;
    }
  }

  async filterMedia(config: ReadarrInstance, media: ReadarrAuthor[]): Promise<ReadarrAuthor[]> {
    return this.filterAuthors(config, media);
  }

}

export const readarrService = new ReadarrService();
