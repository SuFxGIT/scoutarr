export interface NotificationConfig {
  discordWebhook: string;
  notifiarrPassthroughWebhook: string;
  notifiarrPassthroughDiscordChannelId: string;
}

export interface RadarrInstance {
  id: string; // Unique identifier for this instance
  instanceId?: number; // Unique numeric ID (1, 2, 3, etc.)
  name: string; // Display name
  url: string;
  apiKey: string;
  count: number | 'max' | 'MAX';
  tagName: string;
  ignoreTag: string;
  monitored: boolean;
  movieStatus: 'announced' | 'in cinemas' | 'released' | 'any';
  qualityProfileName: string;
  enabled?: boolean;
  schedule?: string; // Cron expression for per-instance scheduling
  scheduleEnabled?: boolean; // Enable/disable scheduling for this instance
}

export interface SonarrInstance {
  id: string; // Unique identifier for this instance
  instanceId?: number; // Unique numeric ID (1, 2, 3, etc.)
  name: string; // Display name
  url: string;
  apiKey: string;
  count: number | 'max' | 'MAX';
  tagName: string;
  ignoreTag: string;
  monitored: boolean;
  seriesStatus: 'continuing' | 'upcoming' | 'ended' | '';
  qualityProfileName: string;
  enabled?: boolean;
  schedule?: string; // Cron expression for per-instance scheduling
  scheduleEnabled?: boolean; // Enable/disable scheduling for this instance
}

export interface ApplicationsConfig {
  radarr: RadarrInstance[];
  sonarr: SonarrInstance[];
}

export interface SchedulerConfig {
  enabled: boolean;
  schedule: string; // Cron expression (e.g., "0 */6 * * *" for every 6 hours)
  unattended: boolean; // When enabled, automatically removes tags and re-filters when no media is found
}

export interface Config {
  notifications: NotificationConfig;
  applications: ApplicationsConfig;
  scheduler: SchedulerConfig;
}

