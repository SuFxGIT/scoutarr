import { SonarrInstance } from '@scoutarr/shared';
import { BaseStarrService } from './baseStarrService.js';
import logger from '../utils/logger.js';
import { applyCommonFilters, FilterableMedia } from '../utils/filterUtils.js';
import { fetchCustomFormatScores } from '../utils/customFormatUtils.js';

export interface SonarrSeries extends FilterableMedia {
  title: string;
}

class SonarrService extends BaseStarrService<SonarrInstance, SonarrSeries> {
  protected readonly appName = 'Sonarr';
  protected readonly apiVersion = 'v3' as const;
  protected readonly mediaEndpoint = 'series';
  protected readonly qualityProfileEndpoint = 'qualityprofile';
  protected readonly editorEndpoint = 'series/editor';
  protected readonly mediaIdField = 'seriesIds' as const;

  protected getMediaTypeName(): string {
    return 'series';
  }

  async getSeries(config: SonarrInstance): Promise<SonarrSeries[]> {
    logger.info('📡 [Sonarr API] Fetching series', { url: config.url, name: config.name });
    try {
      const client = this.createClient(config);
      const response = await client.get<SonarrSeries[]>(`/api/${this.apiVersion}/${this.mediaEndpoint}`);
      const series = response.data;

      // Sonarr's /api/v3/series endpoint doesn't include customFormatScore in episodeFile
      // We need to fetch episode files separately to get custom format scores
      const episodeFileIds = series
        .map(s => (s as { episodeFile?: { id?: number } }).episodeFile?.id)
        .filter((id): id is number => id !== undefined && id > 0);

      logger.debug('📺 [Sonarr API] Extracting episode file IDs for custom format scores', { 
        episodeFileCount: episodeFileIds.length,
        totalSeries: series.length
      });

      const fileScoresMap = await fetchCustomFormatScores({
        client,
        apiVersion: this.apiVersion,
        endpoint: 'episodefile',
        paramName: 'episodeFileIds',
        fileIds: episodeFileIds,
        appName: this.appName
      });

      logger.debug('✅ [Sonarr API] Retrieved custom format scores', { 
        scoresFound: fileScoresMap.size,
        fileIdsRequested: episodeFileIds.length
      });

      // Add customFormatScore to each series' episodeFile
      const seriesWithScores = series.map(s => {
        const episodeFile = (s as { episodeFile?: { id?: number } }).episodeFile;
        if (episodeFile?.id && fileScoresMap.has(episodeFile.id)) {
          return {
            ...s,
            episodeFile: {
              ...episodeFile,
              customFormatScore: fileScoresMap.get(episodeFile.id)
            }
          } as SonarrSeries;
        }
        return s;
      });

      logger.info('✅ [Sonarr API] Series fetch completed', { 
        totalSeries: seriesWithScores.length,
        withCustomScores: seriesWithScores.filter(s => (s as any).episodeFile?.customFormatScore !== undefined).length
      });

      return seriesWithScores;
    } catch (error: unknown) {
      this.logError('Failed to fetch series', error, { url: config.url, name: config.name });
      throw error;
    }
  }

  async searchSeries(config: SonarrInstance, seriesId: number): Promise<void> {
    logger.info('🔍 [Sonarr API] Searching series', { name: config.name, seriesId });
    try {
      const client = this.createClient(config);
      await client.post(`/api/${this.apiVersion}/command`, {
        name: 'SeriesSearch',
        seriesId
      });
      logger.debug('✅ [Sonarr API] Search command sent', { seriesId });
    } catch (error: unknown) {
      this.logError('Failed to search series', error, { 
        seriesId,
        url: config.url,
        name: config.name
      });
      throw error;
    }
  }

  // Implement abstract methods
  async getMedia(config: SonarrInstance): Promise<SonarrSeries[]> {
    return this.getSeries(config);
  }

  async searchMedia(config: SonarrInstance, mediaIds: number[]): Promise<void> {
    // Sonarr only supports searching one series at a time
    if (mediaIds.length > 0) {
      await this.searchSeries(config, mediaIds[0]);
    }
  }

  async filterSeries(config: SonarrInstance, series: SonarrSeries[]): Promise<SonarrSeries[]> {
    logger.info('🔽 [Sonarr] Starting series filtering', { 
      totalSeries: series.length,
      name: config.name,
      filters: {
        monitored: config.monitored,
        tagName: config.tagName,
        ignoreTag: config.ignoreTag,
        qualityProfileName: config.qualityProfileName,
        seriesStatus: config.seriesStatus
      }
    });
    try {
      const initialCount = series.length;

      // Apply common filters (monitored, tag, quality profile, ignore tag)
      logger.debug('🔽 [Sonarr] Applying common filters', { count: series.length });
      let filtered = await applyCommonFilters(
        series,
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
      logger.debug('✅ [Sonarr] Common filters applied', { 
        before: initialCount,
        after: filtered.length,
        removed: initialCount - filtered.length
      });

      // Filter by series status
      if (config.seriesStatus) {
        const beforeStatusFilter = filtered.length;
        logger.debug('🔽 [Sonarr] Applying series status filter', { 
          seriesStatus: config.seriesStatus,
          count: beforeStatusFilter
        });
        filtered = filtered.filter(s => s.status === config.seriesStatus);
        logger.debug('✅ [Sonarr] Series status filter applied', {
          status: config.seriesStatus,
          before: beforeStatusFilter,
          after: filtered.length,
          removed: beforeStatusFilter - filtered.length
        });
      } else {
        logger.debug('⏭️  [Sonarr] Skipping series status filter (not configured)');
      }

      logger.info('✅ [Sonarr] Series filtering completed', {
        initial: initialCount,
        final: filtered.length,
        totalRemoved: initialCount - filtered.length,
        filterEfficiency: `${((1 - filtered.length / initialCount) * 100).toFixed(1)}%`
      });

      return filtered;
    } catch (error: unknown) {
      this.logError('Failed to filter series', error, { 
        seriesCount: series.length,
        name: config.name
      });
      throw error;
    }
  }

  async filterMedia(config: SonarrInstance, media: SonarrSeries[]): Promise<SonarrSeries[]> {
    return this.filterSeries(config, media);
  }

}

export const sonarrService = new SonarrService();
