export interface NotificationConfig {
  discordWebhook: string;
  notifiarrPassthroughWebhook: string;
  notifiarrPassthroughDiscordChannelId: string;
}

export interface RadarrInstance {
  id: string;
  instanceId?: number; // Unique numeric ID (1, 2, 3, etc.)
  name: string;
  url: string;
  apiKey: string;
  count: number | 'max' | 'MAX';
  tagName: string;
  ignoreTag: string;
  monitored: boolean;
  movieStatus: 'announced' | 'in cinemas' | 'released';
  qualityProfileName: string;
  enabled?: boolean;
}

export interface SonarrInstance {
  id: string;
  instanceId?: number; // Unique numeric ID (1, 2, 3, etc.)
  name: string;
  url: string;
  apiKey: string;
  count: number | 'max' | 'MAX';
  tagName: string;
  ignoreTag: string;
  monitored: boolean;
  seriesStatus: 'continuing' | 'upcoming' | 'ended' | '';
  qualityProfileName: string;
  enabled?: boolean;
}

// Legacy single instance configs (for backward compatibility)
export interface RadarrConfig {
  url: string;
  apiKey: string;
  count: number | 'max' | 'MAX';
  tagName: string;
  ignoreTag: string;
  monitored: boolean;
  movieStatus: 'announced' | 'in cinemas' | 'released';
  qualityProfileName: string;
}

export interface SonarrConfig {
  url: string;
  apiKey: string;
  count: number | 'max' | 'MAX';
  tagName: string;
  ignoreTag: string;
  monitored: boolean;
  seriesStatus: 'continuing' | 'upcoming' | 'ended' | '';
  qualityProfileName: string;
}

export interface LidarrConfig {
  url: string;
  apiKey: string;
  count: number | 'max' | 'MAX';
  tagName: string;
  ignoreTag: string;
  monitored: boolean;
  artistStatus: 'continuing' | 'ended' | '';
  qualityProfileName: string;
  unattended: boolean;
}

export interface ReadarrConfig {
  url: string;
  apiKey: string;
  count: number | 'max' | 'MAX';
  tagName: string;
  ignoreTag: string;
  monitored: boolean;
  authorStatus: 'continuing' | 'ended' | '';
  qualityProfileName: string;
  unattended: boolean;
}

export interface ApplicationsConfig {
  radarr: RadarrInstance[] | RadarrConfig; // Support both array (new) and single (legacy)
  sonarr: SonarrInstance[] | SonarrConfig; // Support both array (new) and single (legacy)
  lidarr: LidarrConfig;
  readarr: ReadarrConfig;
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

