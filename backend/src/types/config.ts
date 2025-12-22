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
  movieStatus: 'announced' | 'in cinemas' | 'released';
  qualityProfileName: string;
  unattended: boolean;
  enabled?: boolean;
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
  unattended: boolean;
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
  unattended: boolean;
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
  unattended: boolean;
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
}

export interface Config {
  notifications: NotificationConfig;
  applications: ApplicationsConfig;
  scheduler: SchedulerConfig;
}

