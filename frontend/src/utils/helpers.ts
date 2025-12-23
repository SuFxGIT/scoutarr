/**
 * Format application name from instance ID or app name
 * Examples: "radarr-1" -> "Radarr", "sonarr-main" -> "Sonarr"
 */
export const formatAppName = (app: string): string => {
  if (app.includes('-')) {
    const parts = app.split('-');
    const appType = parts[0].charAt(0).toUpperCase() + parts[0].slice(1);
    return appType;
  }
  return app.charAt(0).toUpperCase() + app.slice(1);
};

/**
 * Extract error message from axios error
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

