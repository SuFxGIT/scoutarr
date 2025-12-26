/**
 * Shared types for Starr applications (Radarr, Sonarr, Lidarr, Readarr)
 */
import type { RadarrInstance, SonarrInstance, LidarrInstance, ReadarrInstance } from './config.js';

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
  name?: string; // Changed to optional to match actual instance types
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
  | RadarrInstance
  | SonarrInstance
  | LidarrInstance
  | ReadarrInstance;
