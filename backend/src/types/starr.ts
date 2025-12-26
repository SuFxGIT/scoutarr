/**
 * Shared types for Starr applications (Radarr, Sonarr, Lidarr, Readarr)
 */

export interface StarrTag {
  id: number;
  label: string;
}

export interface StarrQualityProfile {
  id: number;
  name: string;
}

/**
 * Base interface for all Starr instance configurations
 */
export interface BaseStarrInstance {
  id: string;
  instanceId?: number;
  name: string;
  url: string;
  apiKey: string;
  count: number | 'max';
  tagName: string;
  ignoreTag: string;
  monitored: boolean;
  qualityProfileName: string;
  enabled?: boolean;
  schedule?: string;
  scheduleEnabled?: boolean;
}

/**
 * Union type for all Starr instance configurations
 */
export type StarrInstanceConfig = 
  | import('./config.js').RadarrInstance
  | import('./config.js').SonarrInstance
  | import('./config.js').LidarrInstance
  | import('./config.js').ReadarrInstance;

/**
 * Union type for all Starr media types
 */
export type StarrMedia = 
  | import('../services/radarrService.js').RadarrMovie
  | import('../services/sonarrService.js').SonarrSeries
  | import('../services/lidarrService.js').LidarrArtist
  | import('../services/readarrService.js').ReadarrAuthor;
