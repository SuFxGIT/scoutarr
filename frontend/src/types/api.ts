/**
 * API Response Types
 * Centralized type definitions for API responses
 */

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
