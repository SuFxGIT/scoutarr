import { SonarrInstance } from '@scoutarr/shared';
import { BaseStarrService } from './baseStarrService.js';
import { FilterableMedia } from '../utils/filterUtils.js';
import logger from '../utils/logger.js';

export interface SonarrEpisode extends FilterableMedia {
  title: string;
  seriesId: number;
  seriesTitle: string;
  seasonNumber: number;
  episodeNumber: number;
  episodeTitle: string;
  episodeFileId?: number;
  episodeFile?: { dateAdded?: string; customFormatScore?: number };
  hasFile: boolean;
}

interface SonarrApiSeries {
  id: number;
  title: string;
  status: string;
  monitored: boolean;
  qualityProfileId: number;
  tags: number[];
  [key: string]: unknown;
}

interface SonarrApiEpisode {
  id: number;
  seriesId: number;
  seasonNumber: number;
  episodeNumber: number;
  title: string | null;
  hasFile: boolean;
  monitored: boolean;
  episodeFileId: number;
  episodeFile?: {
    id: number;
    dateAdded?: string;
    customFormatScore?: number;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

class SonarrService extends BaseStarrService<SonarrInstance, SonarrEpisode> {
  protected readonly appName = 'Sonarr';
  protected readonly apiVersion = 'v3' as const;
  protected readonly mediaEndpoint = 'series';
  protected readonly qualityProfileEndpoint = 'qualityprofile';
  protected readonly editorEndpoint = 'series/editor';
  protected readonly mediaIdField = 'seriesIds' as const;

  protected getMediaTypeName(): string {
    return 'episodes';
  }

  protected getFileIdField(): string {
    return 'episodeFile.id';
  }

  protected getFileEndpoint(): string {
    return 'episodefile';
  }

  protected getFileParamName(): string {
    return 'episodeFileIds';
  }

  protected getSearchCommandName(): string {
    return 'SeriesSearch';
  }

  protected getStatusFilterKey(): string {
    return 'seriesStatus';
  }

  protected extractFileIds(episodes: SonarrEpisode[]): number[] {
    return episodes
      .map(e => e.episodeFileId)
      .filter((id): id is number => id !== undefined && id > 0);
  }

  protected applyCustomFormatScores(episodes: SonarrEpisode[], _scoresMap: Map<number, number | undefined>): SonarrEpisode[] {
    // Scores are already embedded in episodeFile from the API response
    return episodes;
  }

  protected applyStatusFilter(episodes: SonarrEpisode[], statusValue: string): SonarrEpisode[] {
    return episodes.filter(e => e.status === statusValue);
  }

  async getMedia(config: SonarrInstance): Promise<SonarrEpisode[]> {
    const client = this.createClient(config);

    // Fetch all series
    logger.info(`📡 [Sonarr API] Fetching series`, { url: config.url, name: config.name });
    const seriesResponse = await client.get<SonarrApiSeries[]>(`/api/${this.apiVersion}/series`);
    const allSeries = seriesResponse.data;
    logger.info(`✅ [Sonarr API] Fetched ${allSeries.length} series`);

    // Fetch episodes for each series
    const allEpisodes: SonarrEpisode[] = [];
    for (const series of allSeries) {
      try {
        const episodeResponse = await client.get<SonarrApiEpisode[]>(
          `/api/${this.apiVersion}/episode`,
          { params: { seriesId: series.id, includeEpisodeFile: true } }
        );

        for (const ep of episodeResponse.data) {
          allEpisodes.push({
            id: ep.id,
            title: series.title,
            seriesId: series.id,
            seriesTitle: series.title,
            seasonNumber: ep.seasonNumber,
            episodeNumber: ep.episodeNumber,
            episodeTitle: ep.title || '',
            monitored: ep.monitored,
            tags: series.tags as unknown as string[],
            status: series.status,
            qualityProfileId: series.qualityProfileId,
            hasFile: ep.hasFile,
            episodeFileId: ep.episodeFileId > 0 ? ep.episodeFileId : undefined,
            episodeFile: ep.episodeFile ? {
              dateAdded: ep.episodeFile.dateAdded,
              customFormatScore: ep.episodeFile.customFormatScore
            } : undefined
          });
        }
      } catch (error: unknown) {
        logger.error(`❌ [Sonarr API] Failed to fetch episodes for series ${series.id} (${series.title})`, {
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }

    logger.info(`✅ [Sonarr API] Fetched ${allEpisodes.length} episodes across ${allSeries.length} series`);
    return allEpisodes;
  }

  async searchMedia(config: SonarrInstance, mediaIds: number[]): Promise<void> {
    // Sonarr searches by series ID, one at a time
    for (const seriesId of mediaIds) {
      await this.searchMediaItems(config, [seriesId], true);
    }
  }

  async filterMedia(config: SonarrInstance, media: SonarrEpisode[]): Promise<SonarrEpisode[]> {
    return this.filterMediaItems(config, media);
  }
}

export const sonarrService = new SonarrService();
