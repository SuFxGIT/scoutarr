import { radarrService, RadarrMovie } from '../services/radarrService.js';
import { sonarrService, SonarrSeries } from '../services/sonarrService.js';
import { lidarrService, LidarrArtist } from '../services/lidarrService.js';
import { readarrService, ReadarrAuthor } from '../services/readarrService.js';
import { RadarrInstance, SonarrInstance, LidarrInstance, ReadarrInstance } from '@scoutarr/shared';
import { AppType } from './starrUtils.js';
import { FilterableMedia } from './filterUtils.js';

/**
 * Service methods interface for each app type
 */
export interface ServiceMethods<TConfig, TMedia extends FilterableMedia> {
  getMedia: (config: TConfig) => Promise<TMedia[]>;
  filterMedia: (config: TConfig, media: TMedia[]) => Promise<TMedia[]>;
  getMediaId: (media: TMedia) => number;
  getMediaTitle: (media: TMedia) => string;
  getTagId: (config: TConfig, tagName: string) => Promise<number | null>;
  getQualityProfiles: (config: TConfig) => Promise<Array<{ id: number; name: string }>>;
  getAllMedia: (config: TConfig) => Promise<TMedia[]>;
  addTag: (config: TConfig, mediaIds: number[], tagId: number) => Promise<void>;
  removeTag: (config: TConfig, mediaIds: number[], tagId: number) => Promise<void>;
  removeTagFromMedia: (config: TConfig, mediaIds: number[], tagId: number) => Promise<void>;
}

/**
 * Service registry - single source of truth for service-to-app-type mapping
 */
export const serviceRegistry: Record<AppType, ServiceMethods<any, any>> = {
  radarr: {
    getMedia: (config: RadarrInstance) => radarrService.getMovies(config),
    filterMedia: (config: RadarrInstance, media: RadarrMovie[]) => radarrService.filterMovies(config, media),
    getMediaId: (m: RadarrMovie) => radarrService.getMediaId(m),
    getMediaTitle: (m: RadarrMovie) => radarrService.getMediaTitle(m),
    getTagId: (config: RadarrInstance, tagName: string) => radarrService.getTagId(config, tagName),
    getQualityProfiles: (config: RadarrInstance) => radarrService.getQualityProfiles(config),
    getAllMedia: (config: RadarrInstance) => radarrService.getMovies(config),
    addTag: (config: RadarrInstance, mediaIds: number[], tagId: number) =>
      radarrService.addTag(config, mediaIds, tagId),
    removeTag: (config: RadarrInstance, mediaIds: number[], tagId: number) =>
      radarrService.removeTag(config, mediaIds, tagId),
    removeTagFromMedia: (config: RadarrInstance, mediaIds: number[], tagId: number) =>
      radarrService.removeTag(config, mediaIds, tagId)
  },
  sonarr: {
    getMedia: (config: SonarrInstance) => sonarrService.getSeries(config),
    filterMedia: (config: SonarrInstance, media: SonarrSeries[]) => sonarrService.filterSeries(config, media),
    getMediaId: (s: SonarrSeries) => sonarrService.getMediaId(s),
    getMediaTitle: (s: SonarrSeries) => sonarrService.getMediaTitle(s),
    getTagId: (config: SonarrInstance, tagName: string) => sonarrService.getTagId(config, tagName),
    getQualityProfiles: (config: SonarrInstance) => sonarrService.getQualityProfiles(config),
    getAllMedia: (config: SonarrInstance) => sonarrService.getSeries(config),
    addTag: (config: SonarrInstance, mediaIds: number[], tagId: number) =>
      sonarrService.addTag(config, mediaIds, tagId),
    removeTag: (config: SonarrInstance, mediaIds: number[], tagId: number) =>
      sonarrService.removeTag(config, mediaIds, tagId),
    removeTagFromMedia: (config: SonarrInstance, mediaIds: number[], tagId: number) =>
      sonarrService.removeTag(config, mediaIds, tagId)
  },
  lidarr: {
    getMedia: (config: LidarrInstance) => lidarrService.getArtists(config),
    filterMedia: (config: LidarrInstance, media: LidarrArtist[]) => lidarrService.filterArtists(config, media),
    getMediaId: (a: LidarrArtist) => lidarrService.getMediaId(a),
    getMediaTitle: (a: LidarrArtist) => lidarrService.getMediaTitle(a),
    getTagId: (config: LidarrInstance, tagName: string) => lidarrService.getTagId(config, tagName),
    getQualityProfiles: (config: LidarrInstance) => lidarrService.getQualityProfiles(config),
    getAllMedia: (config: LidarrInstance) => lidarrService.getArtists(config),
    addTag: (config: LidarrInstance, mediaIds: number[], tagId: number) =>
      lidarrService.addTag(config, mediaIds, tagId),
    removeTag: (config: LidarrInstance, mediaIds: number[], tagId: number) =>
      lidarrService.removeTag(config, mediaIds, tagId),
    removeTagFromMedia: (config: LidarrInstance, mediaIds: number[], tagId: number) =>
      lidarrService.removeTag(config, mediaIds, tagId)
  },
  readarr: {
    getMedia: (config: ReadarrInstance) => readarrService.getAuthors(config),
    filterMedia: (config: ReadarrInstance, media: ReadarrAuthor[]) => readarrService.filterAuthors(config, media),
    getMediaId: (a: ReadarrAuthor) => readarrService.getMediaId(a),
    getMediaTitle: (a: ReadarrAuthor) => readarrService.getMediaTitle(a),
    getTagId: (config: ReadarrInstance, tagName: string) => readarrService.getTagId(config, tagName),
    getQualityProfiles: (config: ReadarrInstance) => readarrService.getQualityProfiles(config),
    getAllMedia: (config: ReadarrInstance) => readarrService.getAuthors(config),
    addTag: (config: ReadarrInstance, mediaIds: number[], tagId: number) =>
      readarrService.addTag(config, mediaIds, tagId),
    removeTag: (config: ReadarrInstance, mediaIds: number[], tagId: number) =>
      readarrService.removeTag(config, mediaIds, tagId),
    removeTagFromMedia: (config: ReadarrInstance, mediaIds: number[], tagId: number) =>
      readarrService.removeTag(config, mediaIds, tagId)
  }
};

/**
 * Get service methods for an app type
 */
export function getServiceForApp<T extends AppType>(appType: T): ServiceMethods<any, any> {
  const service = serviceRegistry[appType];
  if (!service) {
    throw new Error(`Unsupported app type: ${appType}`);
  }
  return service;
}

