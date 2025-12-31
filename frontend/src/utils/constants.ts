/**
 * Application constants
 */
export const ITEMS_PER_PAGE = 15;
export const MAX_INSTANCES_PER_APP = 4;

/**
 * UI Constants
 */
export const LOG_CONTAINER_HEIGHT = '400px';
export const LOG_SCROLL_THRESHOLD = 100;
export const AUTO_RELOAD_DELAY_MS = 1000;
export const LOGO_HEIGHT = '2.5rem';
export const LOG_BG_COLOR = '#1a1a1a';

/**
 * Supported application types
 * Note: This should match backend/src/utils/starrUtils.ts APP_TYPES
 * Frontend maintains its own copy for type checking purposes.
 */
export const APP_TYPES = ['radarr', 'sonarr', 'lidarr', 'readarr'] as const;
export type AppType = typeof APP_TYPES[number];
