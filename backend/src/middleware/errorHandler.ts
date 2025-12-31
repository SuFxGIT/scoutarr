/**
 * Express middleware for centralized error handling
 * Provides consistent error responses and reduces duplication in routes
 */
import { Request, Response, NextFunction } from 'express';
import logger from '../utils/logger.js';
import { getErrorMessage } from '../utils/errorUtils.js';

/**
 * Wraps async route handlers to catch errors and pass them to error middleware
 * Eliminates need for try-catch blocks in every route
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<any>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/**
 * Global error handling middleware
 * Must be registered after all routes
 */
export function errorHandler(
  error: unknown,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  const errorMessage = getErrorMessage(error);
  const errorStack = error instanceof Error ? error.stack : undefined;
  const errorName = error instanceof Error ? error.name : 'Error';
  
  // Default status code
  let statusCode = 500;
  
  // Check if error has a custom status code
  if (error && typeof error === 'object' && 'statusCode' in error) {
    statusCode = (error as any).statusCode;
  }

  logger.error(`❌ Request failed: ${req.method} ${req.path}`, {
    error: errorMessage,
    errorName,
    stack: errorStack,
    statusCode,
    method: req.method,
    path: req.path,
    query: req.query,
    body: req.body
  });

  res.status(statusCode).json({
    error: 'Request failed',
    message: errorMessage
  });
}

/**
 * 404 Not Found handler
 * Should be registered after all routes but before error handler
 * Only handles API routes - non-API routes should be handled by SPA fallback
 */
export function notFoundHandler(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // Only handle API routes that weren't matched
  if (req.path.startsWith('/api/')) {
    logger.warn(`⚠️  Route not found: ${req.method} ${req.path}`);
    res.status(404).json({
      error: 'Not Found',
      message: `Route ${req.method} ${req.path} not found`
    });
  } else {
    // Pass through to SPA fallback for non-API routes
    next();
  }
}
