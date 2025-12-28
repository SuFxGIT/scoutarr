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
    count?: number;
    total?: number;
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

export interface StatusResponse {
  [key: string]: InstanceStatus | {
    enabled: boolean;
    globalEnabled?: boolean;
    running: boolean;
    schedule: string | null;
    nextRun: string | null;
    instances?: Record<string, { schedule: string; nextRun: string | null; running: boolean }>;
  };
}

export interface SchedulerHistoryEntry {
  timestamp: string;
  results: unknown;
  success: boolean;
  error?: string;
}

export interface Stats {
  totalTriggers: number;
  triggersByApplication: Record<string, number>;
  triggersByInstance: Record<string, number>;
  recentTriggers: Array<{
    timestamp: string;
    application: string;
    instance?: string;
    count: number;
    items: Array<{ id: number; title: string }>;
  }>;
  lastTrigger?: string;
}

export interface MediaLibraryItem {
  id: number;
  title: string;
  monitored: boolean;
  status: string;
  qualityProfileId: number;
  qualityProfileName?: string;
  tags: number[];
  lastTriggered?: string;
}

export interface MediaLibraryResponse {
  media: MediaLibraryItem[];
  total: number;
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
