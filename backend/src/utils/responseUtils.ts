/**
 * Standard API response interfaces and utilities
 */

export interface StandardResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

/**
 * Create a successful response with optional data and message
 */
export function successResponse<T>(data?: T, message?: string): StandardResponse<T> {
  const response: StandardResponse<T> = { success: true };
  if (data !== undefined) response.data = data;
  if (message) response.message = message;
  return response;
}

/**
 * Create an error response with error message
 */
export function errorResponse(error: string, message?: string): StandardResponse {
  const response: StandardResponse = { success: false, error };
  if (message) response.message = message;
  return response;
}
