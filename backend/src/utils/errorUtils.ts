/**
 * Error handling utilities for consistent error responses and logging
 */
import { Response } from 'express';
import logger from './logger.js';

/**
 * Standard error response format
 */
export interface ErrorResponse {
  error: string;
  message?: string;
}

/**
 * Extracts error message from unknown error type
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  return 'Unknown error occurred';
}

/**
 * Logs error and sends standardized error response
 */
export function handleRouteError(
  res: Response,
  error: unknown,
  context: string,
  statusCode: number = 500
): void {
  const errorMessage = getErrorMessage(error);
  logger.error(`❌ ${context}`, { error: errorMessage });
  res.status(statusCode).json({
    error: context,
    message: errorMessage
  } as ErrorResponse);
}

/**
 * Logs warning for non-critical errors
 */
export function logWarning(context: string, error: unknown): void {
  const errorMessage = getErrorMessage(error);
  logger.warn(`⚠️  ${context}`, { error: errorMessage });
}

/**
 * Logs debug information for expected failures
 */
export function logDebug(context: string, error: unknown): void {
  const errorMessage = getErrorMessage(error);
  logger.debug(context, { error: errorMessage });
}
