/**
 * API Response Types
 * Centralized type definitions for API responses
 */

export interface SearchResult {
  success: boolean;
  searched: number;
  items: Array<{ id: number; title: string }>;
  error?: string;
}

export interface SearchResults {
  [key: string]: {
    success: boolean;
    searched?: number;
    movies?: Array<{ id: number; title: string }>;
    series?: Array<{ id: number; title: string }>;
    artists?: Array<{ id: number; title: string }>;
    authors?: Array<{ id: number; title: string }>;
    items?: Array<{ id: number; title: string }>;
    error?: string;
    instanceName?: string;
  };
}

export interface InstanceStatus {
  connected: boolean;
  configured: boolean;
  version?: string;
  appName?: string;
  error?: string;
  instanceName?: string;
}

export interface SchedulerStatus {
  enabled: boolean;
  running: boolean;
  schedule: string | null;
  nextRun: string | null;
}

export interface SyncSchedulerStatus {
  enabled: boolean;
  schedule: string | null;
  nextRun: string | null;
}

export interface StatusResponse {
  scheduler?: SchedulerStatus;
  sync?: SyncSchedulerStatus;
  [key: string]: InstanceStatus | SchedulerStatus | SyncSchedulerStatus | undefined;
}

export interface Stats {
  totalSearches: number;
  searchesByApplication: Record<string, number>;
  searchesByInstance: Record<string, number>;
  recentSearches: Array<{
    timestamp: string;
    application: string;
    instance?: string;
    count: number;
    items: Array<{ id: number; title: string }>;
  }>;
  lastSearch?: string;
}

export interface MediaLibraryItem {
  id: number;
  title: string;
  monitored: boolean;
  status: string;
  qualityProfileName?: string;
  tags: string[]; // Tag names, not IDs
  lastSearched?: string;
  dateImported?: string;
  customFormatScore?: number;
  hasFile?: boolean;
}

export interface MediaLibraryResponse {
  media: MediaLibraryItem[];
  total: number; // Absolute total in database for this instance
  filtered: number; // Count after applying instance filters (same as media.length after filters)
  instanceName: string;
  appType: string;
}

export interface MediaSearchRequest {
  appType: 'radarr' | 'sonarr' | 'lidarr' | 'readarr';
  instanceId: string;
  mediaIds: number[];
}

export interface MediaSearchResponse {
  success: boolean;
  searched: number;
  message: string;
}
