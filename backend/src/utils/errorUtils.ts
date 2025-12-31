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
 * Extracts error details (message, stack, name) for logging
 * Reduces boilerplate in error handlers
 */
export function getErrorDetails(error: unknown): {
  message: string;
  stack?: string;
  name: string;
} {
  if (error instanceof Error) {
    return {
      message: error.message,
      stack: error.stack,
      name: error.name
    };
  }
  return {
    message: typeof error === 'string' ? error : 'Unknown error occurred',
    name: 'Error'
  };
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
  const errorStack = error instanceof Error ? error.stack : undefined;
  const errorName = error instanceof Error ? error.name : 'Error';
  
  logger.error(`❌ ${context}`, { 
    error: errorMessage,
    errorName,
    stack: errorStack,
    statusCode
  });
  
  res.status(statusCode).json({
    error: context,
    message: errorMessage
  } as ErrorResponse);
}
