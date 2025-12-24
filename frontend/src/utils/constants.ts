/**
 * Application constants
 */
export const ITEMS_PER_PAGE = 15;
export const MAX_INSTANCES_PER_APP = 4;
export const REFETCH_INTERVAL = 10000; // 10 seconds

/**
 * Supported application types
 */
export const APP_TYPES = ['radarr', 'sonarr', 'lidarr', 'readarr'] as const;
export type AppType = typeof APP_TYPES[number];

/**
 * Cron expression presets
 */
export const CRON_PRESETS: Record<string, string> = {
  'every-1-min': '*/1 * * * *',
  'every-10-min': '*/10 * * * *',
  'every-30-min': '*/30 * * * *',
  'every-hour': '0 * * * *',
  'every-6-hours': '0 */6 * * *',
  'every-12-hours': '0 */12 * * *',
  'daily-midnight': '0 0 * * *',
  'daily-noon': '0 12 * * *',
  'twice-daily': '0 0,12 * * *',
  'weekly-sunday': '0 0 * * 0',
  'custom': ''
} as const;

/**
 * Get preset key from cron expression
 */
export const getPresetFromSchedule = (schedule: string): string => {
  for (const [preset, cron] of Object.entries(CRON_PRESETS)) {
    if (cron === schedule) {
      return preset;
    }
  }
  return 'custom';
};

