import { LidarrInstance } from '@scoutarr/shared';
import { BaseStarrService } from './baseStarrService.js';
import logger from '../utils/logger.js';
import { applyCommonFilters, FilterableMedia } from '../utils/filterUtils.js';
import { getErrorMessage } from '../utils/errorUtils.js';

export interface LidarrArtist extends FilterableMedia {
  artistName: string;
  title?: string; // Alias for artistName for consistency
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

  async getArtists(config: LidarrInstance): Promise<LidarrArtist[]> {
    try {
      const client = this.createClient(config);
      const response = await client.get<LidarrArtist[]>(`/api/${this.apiVersion}/${this.mediaEndpoint}`);
      const artists = response.data.map(artist => ({
        ...artist,
        title: artist.artistName || artist.title
      }));

      // Lidarr's /api/v1/artist endpoint doesn't include customFormatScore in trackFiles
      // We need to fetch track files separately to get custom format scores
      const trackFileIds: number[] = [];

      // Collect all track file IDs from all artists
      for (const artist of artists) {
        const trackFiles = (artist as { trackFiles?: Array<{ id?: number }> }).trackFiles;
        if (trackFiles && Array.isArray(trackFiles)) {
          trackFileIds.push(...trackFiles.map(f => f.id).filter((id): id is number => id !== undefined && id > 0));
        }
      }

      if (trackFileIds.length > 0) {
        try {
          // Batch requests to avoid 414 URI Too Long errors
          const batchSize = 100;
          const allFiles: Array<{ id: number; customFormatScore?: number }> = [];

          for (let i = 0; i < trackFileIds.length; i += batchSize) {
            const batch = trackFileIds.slice(i, i + batchSize);
            const filesResponse = await client.get<Array<{ id: number; customFormatScore?: number }>>(`/api/${this.apiVersion}/trackfile`, {
              params: { trackFileIds: batch },
              paramsSerializer: { indexes: null }
            });
            allFiles.push(...filesResponse.data);
          }

          // Create a map of trackFileId -> customFormatScore
          const fileScoresMap = new Map(
            allFiles.map(f => [f.id, f.customFormatScore])
          );

          // Add customFormatScore to each artist's trackFiles
          return artists.map(artist => {
            const trackFiles = (artist as { trackFiles?: Array<{ id?: number }> }).trackFiles;
            if (trackFiles && Array.isArray(trackFiles) && trackFiles.length > 0) {
              const updatedTrackFiles = trackFiles.map(trackFile => {
                if (trackFile.id && fileScoresMap.has(trackFile.id)) {
                  return {
                    ...trackFile,
                    customFormatScore: fileScoresMap.get(trackFile.id)
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
        } catch (error: unknown) {
          logger.warn('Failed to fetch track files for custom format scores, continuing without scores', {
            error: getErrorMessage(error)
          });
          return artists;
        }
      }

      return artists;
    } catch (error: unknown) {
      this.logError('Failed to fetch artists', error, { url: config.url });
      throw error;
    }
  }

  async searchArtists(config: LidarrInstance, artistId: number): Promise<void> {
    try {
      const client = this.createClient(config);
      // Lidarr only supports searching one artist at a time
      await client.post(`/api/${this.apiVersion}/command`, {
        name: 'ArtistSearch',
        artistId
      });
      logger.debug('🔎 Searched for artist', { artistId });
    } catch (error: unknown) {
      this.logError('Failed to search artist', error, { artistId });
      throw error;
    }
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

  async filterArtists(config: LidarrInstance, artists: LidarrArtist[]): Promise<LidarrArtist[]> {
    try {
      // Apply common filters (monitored, tag, quality profile, ignore tag)
      let filtered = await applyCommonFilters(
        artists,
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

      // Filter by artist status
      if (config.artistStatus) {
        filtered = filtered.filter(a => a.status === config.artistStatus);
        logger.debug('🔽 Filtered by artist status', {
          count: filtered.length,
          status: config.artistStatus
        });
      }

      return filtered;
    } catch (error: unknown) {
      this.logError('Failed to filter artists', error);
      throw error;
    }
  }

  async filterMedia(config: LidarrInstance, media: LidarrArtist[]): Promise<LidarrArtist[]> {
    return this.filterArtists(config, media);
  }

}

export const lidarrService = new LidarrService();
