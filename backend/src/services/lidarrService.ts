import { LidarrInstance } from '@scoutarr/shared';
import { BaseStarrService } from './baseStarrService.js';
import logger from '../utils/logger.js';
import { applyCommonFilters, FilterableMedia } from '../utils/filterUtils.js';
import { fetchCustomFormatScores } from '../utils/customFormatUtils.js';

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

  async getArtists(config: LidarrInstance): Promise<LidarrArtist[]> {
    logger.info('📡 [Lidarr API] Fetching artists', { url: config.url, name: config.name });
    try {
      const client = this.createClient(config);
      const response = await client.get<LidarrArtist[]>(`/api/${this.apiVersion}/${this.mediaEndpoint}`);
      const artists = response.data;

      // Lidarr's /api/v1/artist endpoint doesn't include customFormatScore in trackFiles
      // We need to fetch track files separately to get custom format scores
      const trackFileIds: number[] = [];

      // Collect all track file IDs from all artists
      logger.debug('🎵 [Lidarr API] Collecting track file IDs from artists');
      for (const artist of artists) {
        const trackFiles = (artist as { trackFiles?: Array<{ id?: number }> }).trackFiles;
        if (trackFiles && Array.isArray(trackFiles)) {
          trackFileIds.push(...trackFiles.map(f => f.id).filter((id): id is number => id !== undefined && id > 0));
        }
      }

      logger.debug('🎵 [Lidarr API] Extracting track file IDs for custom format scores', { 
        trackFileCount: trackFileIds.length,
        totalArtists: artists.length
      });

      const fileScoresMap = await fetchCustomFormatScores({
        client,
        apiVersion: this.apiVersion,
        endpoint: 'trackfile',
        paramName: 'trackFileIds',
        fileIds: trackFileIds,
        appName: this.appName
      });

      logger.debug('✅ [Lidarr API] Retrieved custom format scores', { 
        scoresFound: fileScoresMap.size,
        fileIdsRequested: trackFileIds.length
      });

      // Add customFormatScore to each artist's trackFiles
      const artistsWithScores = artists.map(artist => {
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

      logger.info('✅ [Lidarr API] Artist fetch completed', { 
        totalArtists: artistsWithScores.length,
        totalTrackFiles: trackFileIds.length,
        withCustomScores: fileScoresMap.size
      });

      return artistsWithScores;
    } catch (error: unknown) {
      this.logError('Failed to fetch artists', error, { url: config.url, name: config.name });
      throw error;
    }
  }

  async searchArtists(config: LidarrInstance, artistId: number): Promise<void> {
    logger.info('🔍 [Lidarr API] Searching artist', { name: config.name, artistId });
    try {
      const client = this.createClient(config);
      await client.post(`/api/${this.apiVersion}/command`, {
        name: 'ArtistSearch',
        artistId
      });
      logger.debug('✅ [Lidarr API] Search command sent', { artistId });
    } catch (error: unknown) {
      this.logError('Failed to search artist', error, { 
        artistId,
        url: config.url,
        name: config.name
      });
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
    logger.info('🔽 [Lidarr] Starting artist filtering', { 
      totalArtists: artists.length,
      name: config.name,
      filters: {
        monitored: config.monitored,
        tagName: config.tagName,
        ignoreTag: config.ignoreTag,
        qualityProfileName: config.qualityProfileName,
        artistStatus: config.artistStatus
      }
    });
    try {
      const initialCount = artists.length;

      // Apply common filters (monitored, tag, quality profile, ignore tag)
      logger.debug('🔽 [Lidarr] Applying common filters', { count: artists.length });
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
      logger.debug('✅ [Lidarr] Common filters applied', { 
        before: initialCount,
        after: filtered.length,
        removed: initialCount - filtered.length
      });

      // Filter by artist status
      if (config.artistStatus) {
        const beforeStatusFilter = filtered.length;
        logger.debug('🔽 [Lidarr] Applying artist status filter', { 
          artistStatus: config.artistStatus,
          count: beforeStatusFilter
        });
        filtered = filtered.filter(a => a.status === config.artistStatus);
        logger.debug('✅ [Lidarr] Artist status filter applied', {
          status: config.artistStatus,
          before: beforeStatusFilter,
          after: filtered.length,
          removed: beforeStatusFilter - filtered.length
        });
      } else {
        logger.debug('⏭️  [Lidarr] Skipping artist status filter (not configured)');
      }

      logger.info('✅ [Lidarr] Artist filtering completed', {
        initial: initialCount,
        final: filtered.length,
        totalRemoved: initialCount - filtered.length,
        filterEfficiency: `${((1 - filtered.length / initialCount) * 100).toFixed(1)}%`
      });

      return filtered;
    } catch (error: unknown) {
      this.logError('Failed to filter artists', error, { 
        artistCount: artists.length,
        name: config.name
      });
      throw error;
    }
  }

  async filterMedia(config: LidarrInstance, media: LidarrArtist[]): Promise<LidarrArtist[]> {
    return this.filterArtists(config, media);
  }

}

export const lidarrService = new LidarrService();
