/**
 * Path utilities for consistent path calculations across the application
 */
import path from 'path';
import { fileURLToPath } from 'url';

/**
 * Get the directory name of the current module
 * Equivalent to __dirname in CommonJS
 */
function getDirname(importMetaUrl: string): string {
  const __filename = fileURLToPath(importMetaUrl);
  return path.dirname(__filename);
}

/**
 * Get the config directory path
 * Uses CONFIG_DIR environment variable if set, otherwise defaults to ../../../config 
 * relative to backend/src/utils (where this file is located)
 */
const __dirname = getDirname(import.meta.url);
export function getConfigDir(): string {
  return process.env.CONFIG_DIR || path.join(__dirname, '../../../config');
}

