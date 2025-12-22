export interface NotificationConfig {
  discordWebhook: string;
  notifiarrPassthroughWebhook: string;
  notifiarrPassthroughDiscordChannelId: string;
}

export interface RadarrConfig {
  enabled: boolean;
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
  enabled: boolean;
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
  enabled: boolean;
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
  enabled: boolean;
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
  radarr: RadarrConfig;
  sonarr: SonarrConfig;
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

