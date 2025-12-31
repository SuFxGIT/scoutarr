import { ReadarrInstance } from '@scoutarr/shared';
import { BaseStarrService } from './baseStarrService.js';
import logger from '../utils/logger.js';
import { FilterableMedia } from '../utils/filterUtils.js';

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

  protected getFileIdField(): string[] {
    return ['bookFiles'];
  }

  protected getFileEndpoint(): string {
    return 'bookfile';
  }

  protected getFileParamName(): string {
    return 'bookFileIds';
  }

  protected getSearchCommandName(): string {
    return 'AuthorSearch';
  }

  protected getStatusFilterKey(): string {
    return 'authorStatus';
  }

  protected extractFileIds(authors: ReadarrAuthor[]): number[] {
    const bookFileIds: number[] = [];
    for (const author of authors) {
      const bookFiles = (author as { bookFiles?: Array<{ id?: number }> }).bookFiles;
      if (bookFiles && Array.isArray(bookFiles)) {
        bookFileIds.push(...bookFiles.map(f => f.id).filter((id): id is number => id !== undefined && id > 0));
      }
    }
    return bookFileIds;
  }

  protected applyCustomFormatScores(authors: ReadarrAuthor[], scoresMap: Map<number, number | undefined>): ReadarrAuthor[] {
    return authors.map(author => {
      const bookFiles = (author as { bookFiles?: Array<{ id?: number }> }).bookFiles;
      if (bookFiles && Array.isArray(bookFiles) && bookFiles.length > 0) {
        const updatedBookFiles = bookFiles.map(bookFile => {
          if (bookFile.id && scoresMap.has(bookFile.id)) {
            return {
              ...bookFile,
              customFormatScore: scoresMap.get(bookFile.id)
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
  }

  protected applyStatusFilter(authors: ReadarrAuthor[], statusValue: string): ReadarrAuthor[] {
    return authors.filter(a => a.status === statusValue);
  }

  async getAuthors(config: ReadarrInstance): Promise<ReadarrAuthor[]> {
    return this.fetchMediaWithScores(config);
  }

  async searchAuthors(config: ReadarrInstance, authorId: number): Promise<void> {
    return this.searchMediaItems(config, [authorId], true);
  }

  async filterAuthors(config: ReadarrInstance, authors: ReadarrAuthor[]): Promise<ReadarrAuthor[]> {
    return this.filterMediaItems(config, authors);
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

  async filterMedia(config: ReadarrInstance, media: ReadarrAuthor[]): Promise<ReadarrAuthor[]> {
    return this.filterAuthors(config, media);
  }
}

export const readarrService = new ReadarrService();
