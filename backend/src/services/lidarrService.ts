import { LidarrInstance } from '@scoutarr/shared';
import { BaseStarrService } from './baseStarrService.js';
import logger from '../utils/logger.js';
import { FilterableMedia } from '../utils/filterUtils.js';

export interface LidarrArtist extends FilterableMedia {
  artistName: string;
}

class LidarrService extends BaseStarrService<LidarrInstance, LidarrArtist> {
  protected readonly appName = 'Lidarr';
  protected readonly apiVersion = 'v1' as const;
  protected readonly mediaEndpoint = 'artist';
  protected readonly qualityProfileEndpoint = 'qualityprofile';
  protected readonly editorEndpoint = 'artist/editor';
  protected readonly mediaIdField = 'artistIds' as const;

  protected getMediaTypeName(): string {
    return 'artists';
  }

  protected getFileIdField(): string[] {
    return ['trackFiles'];
  }

  protected getFileEndpoint(): string {
    return 'trackfile';
  }

  protected getFileParamName(): string {
    return 'trackFileIds';
  }

  protected getSearchCommandName(): string {
    return 'ArtistSearch';
  }

  protected getStatusFilterKey(): string {
    return 'artistStatus';
  }

  protected extractFileIds(artists: LidarrArtist[]): number[] {
    const trackFileIds: number[] = [];
    for (const artist of artists) {
      const trackFiles = (artist as { trackFiles?: Array<{ id?: number }> }).trackFiles;
      if (trackFiles && Array.isArray(trackFiles)) {
        trackFileIds.push(...trackFiles.map(f => f.id).filter((id): id is number => id !== undefined && id > 0));
      }
    }
    return trackFileIds;
  }

  protected applyCustomFormatScores(artists: LidarrArtist[], scoresMap: Map<number, number | undefined>): LidarrArtist[] {
    return artists.map(artist => {
      const trackFiles = (artist as { trackFiles?: Array<{ id?: number }> }).trackFiles;
      if (trackFiles && Array.isArray(trackFiles) && trackFiles.length > 0) {
        const updatedTrackFiles = trackFiles.map(trackFile => {
          if (trackFile.id && scoresMap.has(trackFile.id)) {
            return {
              ...trackFile,
              customFormatScore: scoresMap.get(trackFile.id)
            };
          }
          return trackFile;
        });
        return {
          ...artist,
          trackFiles: updatedTrackFiles
        } as LidarrArtist;
      }
      return artist;
    });
  }

  protected applyStatusFilter(artists: LidarrArtist[], statusValue: string): LidarrArtist[] {
    return artists.filter(a => a.status === statusValue);
  }

  async getArtists(config: LidarrInstance): Promise<LidarrArtist[]> {
    return this.fetchMediaWithScores(config);
  }

  async searchArtists(config: LidarrInstance, artistId: number): Promise<void> {
    return this.searchMediaItems(config, [artistId], true);
  }

  async filterArtists(config: LidarrInstance, artists: LidarrArtist[]): Promise<LidarrArtist[]> {
    return this.filterMediaItems(config, artists);
  }

  // Implement abstract methods
  async getMedia(config: LidarrInstance): Promise<LidarrArtist[]> {
    return this.getArtists(config);
  }

  async searchMedia(config: LidarrInstance, mediaIds: number[]): Promise<void> {
    // Lidarr only supports searching one artist at a time
    for (const artistId of mediaIds) {
      await this.searchArtists(config, artistId);
    }
  }

  async filterMedia(config: LidarrInstance, media: LidarrArtist[]): Promise<LidarrArtist[]> {
    return this.filterArtists(config, media);
  }
}

export const lidarrService = new LidarrService();
