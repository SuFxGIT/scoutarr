import { ReadarrInstance } from '@scoutarr/shared';
import { BaseStarrService } from './baseStarrService.js';
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

  async getMedia(config: ReadarrInstance): Promise<ReadarrAuthor[]> {
    return this.fetchMediaWithScores(config);
  }

  async searchMedia(config: ReadarrInstance, mediaIds: number[]): Promise<void> {
    // Readarr only supports searching one author at a time
    await this.searchMediaItems(config, mediaIds, true);
  }

  async filterMedia(config: ReadarrInstance, media: ReadarrAuthor[]): Promise<ReadarrAuthor[]> {
    return this.filterMediaItems(config, media);
  }
}

export const readarrService = new ReadarrService();
