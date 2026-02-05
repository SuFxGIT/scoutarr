import { radarrService, RadarrMovie } from '../services/radarrService.js';
import { sonarrService, SonarrEpisode } from '../services/sonarrService.js';
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
  searchMedia: (config: TConfig, mediaIds: number[]) => Promise<void>;
  getMediaId: (media: TMedia) => number;
  getMediaTitle: (media: TMedia) => string;
  getTagId: (config: TConfig, tagName: string) => Promise<number | null>;
  getQualityProfiles: (config: TConfig) => Promise<Array<{ id: number; name: string }>>;
  addTag: (config: TConfig, mediaIds: number[], tagId: number) => Promise<void>;
  removeTag: (config: TConfig, mediaIds: number[], tagId: number) => Promise<void>;
  convertTagIdsToNames: (config: TConfig, tagIds: number[]) => Promise<string[]>;
}

/**
 * Service registry - single source of truth for service-to-app-type mapping
 */
export const serviceRegistry: Record<AppType, ServiceMethods<any, any>> = {
  radarr: {
    getMedia: (config: RadarrInstance) => radarrService.getMedia(config),
    filterMedia: (config: RadarrInstance, media: RadarrMovie[]) => radarrService.filterMedia(config, media),
    searchMedia: (config: RadarrInstance, mediaIds: number[]) => radarrService.searchMedia(config, mediaIds),
    getMediaId: (m: RadarrMovie) => radarrService.getMediaId(m),
    getMediaTitle: (m: RadarrMovie) => radarrService.getMediaTitle(m),
    getTagId: (config: RadarrInstance, tagName: string) => radarrService.getTagId(config, tagName),
    getQualityProfiles: (config: RadarrInstance) => radarrService.getQualityProfiles(config),
    addTag: (config: RadarrInstance, mediaIds: number[], tagId: number) =>
      radarrService.addTag(config, mediaIds, tagId),
    removeTag: (config: RadarrInstance, mediaIds: number[], tagId: number) =>
      radarrService.removeTag(config, mediaIds, tagId),
    convertTagIdsToNames: (config: RadarrInstance, tagIds: number[]) =>
      radarrService.convertTagIdsToNames(config, tagIds)
  },
  sonarr: {
    getMedia: (config: SonarrInstance) => sonarrService.getMedia(config),
    filterMedia: (config: SonarrInstance, media: SonarrEpisode[]) => sonarrService.filterMedia(config, media),
    searchMedia: (config: SonarrInstance, mediaIds: number[]) => sonarrService.searchMedia(config, mediaIds),
    getMediaId: (e: SonarrEpisode) => sonarrService.getMediaId(e),
    getMediaTitle: (e: SonarrEpisode) => sonarrService.getMediaTitle(e),
    getTagId: (config: SonarrInstance, tagName: string) => sonarrService.getTagId(config, tagName),
    getQualityProfiles: (config: SonarrInstance) => sonarrService.getQualityProfiles(config),
    addTag: (config: SonarrInstance, mediaIds: number[], tagId: number) =>
      sonarrService.addTag(config, mediaIds, tagId),
    removeTag: (config: SonarrInstance, mediaIds: number[], tagId: number) =>
      sonarrService.removeTag(config, mediaIds, tagId),
    convertTagIdsToNames: (config: SonarrInstance, tagIds: number[]) =>
      sonarrService.convertTagIdsToNames(config, tagIds)
  },
  lidarr: {
    getMedia: (config: LidarrInstance) => lidarrService.getMedia(config),
    filterMedia: (config: LidarrInstance, media: LidarrArtist[]) => lidarrService.filterMedia(config, media),
    searchMedia: (config: LidarrInstance, mediaIds: number[]) => lidarrService.searchMedia(config, mediaIds),
    getMediaId: (a: LidarrArtist) => lidarrService.getMediaId(a),
    getMediaTitle: (a: LidarrArtist) => lidarrService.getMediaTitle(a),
    getTagId: (config: LidarrInstance, tagName: string) => lidarrService.getTagId(config, tagName),
    getQualityProfiles: (config: LidarrInstance) => lidarrService.getQualityProfiles(config),
    addTag: (config: LidarrInstance, mediaIds: number[], tagId: number) =>
      lidarrService.addTag(config, mediaIds, tagId),
    removeTag: (config: LidarrInstance, mediaIds: number[], tagId: number) =>
      lidarrService.removeTag(config, mediaIds, tagId),
    convertTagIdsToNames: (config: LidarrInstance, tagIds: number[]) =>
      lidarrService.convertTagIdsToNames(config, tagIds)
  },
  readarr: {
    getMedia: (config: ReadarrInstance) => readarrService.getMedia(config),
    filterMedia: (config: ReadarrInstance, media: ReadarrAuthor[]) => readarrService.filterMedia(config, media),
    searchMedia: (config: ReadarrInstance, mediaIds: number[]) => readarrService.searchMedia(config, mediaIds),
    getMediaId: (a: ReadarrAuthor) => readarrService.getMediaId(a),
    getMediaTitle: (a: ReadarrAuthor) => readarrService.getMediaTitle(a),
    getTagId: (config: ReadarrInstance, tagName: string) => readarrService.getTagId(config, tagName),
    getQualityProfiles: (config: ReadarrInstance) => readarrService.getQualityProfiles(config),
    addTag: (config: ReadarrInstance, mediaIds: number[], tagId: number) =>
      readarrService.addTag(config, mediaIds, tagId),
    removeTag: (config: ReadarrInstance, mediaIds: number[], tagId: number) =>
      readarrService.removeTag(config, mediaIds, tagId),
    convertTagIdsToNames: (config: ReadarrInstance, tagIds: number[]) =>
      readarrService.convertTagIdsToNames(config, tagIds)
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

