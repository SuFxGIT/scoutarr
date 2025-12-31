/**
 * Shared configuration types for Scoutarr
 */

export interface NotificationConfig {
  discordWebhook: string;
  notifiarrPassthroughWebhook: string;
  notifiarrPassthroughDiscordChannelId: string;
  pushoverUserKey: string;
  pushoverApiToken: string;
}

export interface RadarrInstance {
  id: string; // Unique identifier for this instance
  instanceId?: number; // Unique numeric ID (1, 2, 3, etc.)
  name?: string; // Display name
  url: string;
  apiKey: string;
  count: number | 'max';
  tagName: string;
  ignoreTag: string;
  monitored: boolean;
  movieStatus: 'announced' | 'in cinemas' | 'released' | 'any';
  qualityProfileName: string;
  enabled?: boolean;
}

export interface SonarrInstance {
  id: string; // Unique identifier for this instance
  instanceId?: number; // Unique numeric ID (1, 2, 3, etc.)
  name?: string; // Display name
  url: string;
  apiKey: string;
  count: number | 'max';
  tagName: string;
  ignoreTag: string;
  monitored: boolean;
  seriesStatus: 'continuing' | 'upcoming' | 'ended' | '';
  qualityProfileName: string;
  enabled?: boolean;
}

export interface LidarrInstance {
  id: string; // Unique identifier for this instance
  instanceId?: number; // Unique numeric ID (1, 2, 3, etc.)
  name?: string; // Display name
  url: string;
  apiKey: string;
  count: number | 'max';
  tagName: string;
  ignoreTag: string;
  monitored: boolean;
  artistStatus: 'continuing' | 'ended' | '';
  qualityProfileName: string;
  enabled?: boolean;
}

export interface ReadarrInstance {
  id: string; // Unique identifier for this instance
  instanceId?: number; // Unique numeric ID (1, 2, 3, etc.)
  name?: string; // Display name
  url: string;
  apiKey: string;
  count: number | 'max';
  tagName: string;
  ignoreTag: string;
  monitored: boolean;
  authorStatus: 'continuing' | 'ended' | '';
  qualityProfileName: string;
  enabled?: boolean;
}

export interface ApplicationsConfig {
  radarr: RadarrInstance[];
  sonarr: SonarrInstance[];
  lidarr: LidarrInstance[];
  readarr: ReadarrInstance[];
}

export interface SchedulerConfig {
  enabled: boolean;
  schedule: string; // Cron expression (e.g., "0 */6 * * *" for every 6 hours)
  unattended: boolean; // When enabled, automatically removes tags and re-filters when no media is found
}

export interface TasksConfig {
  syncSchedule: string; // Cron expression for sync schedule (e.g., "0 3 * * *" for 3am daily)
  syncEnabled: boolean; // Enable/disable automatic syncing
}

export interface Config {
  notifications: NotificationConfig;
  applications: ApplicationsConfig;
  scheduler: SchedulerConfig;
  tasks: TasksConfig;
}
