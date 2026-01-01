import humanizeDuration from 'humanize-duration';
import { capitalize } from 'es-toolkit';
import { differenceInMilliseconds } from 'date-fns';

/**
 * Format application name from instance ID or app name
 * Examples: "radarr-1" -> "Radarr", "sonarr-main" -> "Sonarr"
 */
export const formatAppName = (app: string): string => {
  if (app.includes('-')) {
    const parts = app.split('-');
    const appType = capitalize(parts[0]);
    return appType;
  }
  return capitalize(app);
};

/**
 * Extract error message from error object
 * Handles axios errors (which have a response.data.error structure) and standard errors
 * Note: This is frontend-specific and differs from the backend version which doesn't need axios handling
 */
export const getErrorMessage = (error: unknown): string => {
  if (error && typeof error === 'object' && 'response' in error) {
    const axiosError = error as { response?: { data?: { error?: string } }; message?: string };
    return axiosError.response?.data?.error || axiosError.message || 'Unknown error';
  }
  if (error instanceof Error) {
    return error.message;
  }
  return 'Unknown error';
};

/**
 * Calculate milliseconds until a future ISO timestamp
 * Returns 0 if the timestamp is in the past
 */
export const calculateTimeUntil = (isoTimestamp: string): number => {
  return Math.max(0, differenceInMilliseconds(new Date(isoTimestamp), new Date()));
};

/**
 * Format milliseconds into human-readable countdown string
 * Examples: "2h 15m", "3d 4h", "45m 30s"
 */
export const formatCountdown = (milliseconds: number): string => {
  if (milliseconds === 0) return 'Now';
  return humanizeDuration(milliseconds, {
    units: ['d', 'h', 'm', 's'],
    round: true,
    largest: 2
  });
};

/**
 * Format milliseconds into human-readable duration for scheduler messages
 * Examples: "2 hours and 30 minutes", "3 days and 4 hours"
 */
export const formatSchedulerDuration = (milliseconds: number): string => {
  return humanizeDuration(milliseconds, {
    round: true,
    largest: 2,
    units: ['d', 'h', 'm'],
    conjunction: ' and ',
    serialComma: false,
  }) || 'less than a minute';
};
