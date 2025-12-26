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

