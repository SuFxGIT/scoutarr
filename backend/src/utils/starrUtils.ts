import axios, { AxiosInstance } from 'axios';
import { capitalize } from 'es-toolkit';
import logger from './logger.js';
import { getErrorMessage } from './errorUtils.js';

/**
 * Supported application types
 * This is the source of truth for application types in the backend.
 * Frontend maintains its own copy for type checking purposes.
 */
export const APP_TYPES = ['radarr', 'sonarr', 'lidarr', 'readarr'] as const;
export type AppType = typeof APP_TYPES[number];

/**
 * Maps app type to media type key (for result objects)
 * Examples: 'radarr' -> 'movies', 'lidarr' -> 'artists', 'readarr' -> 'authors', 'sonarr' -> 'series'
 */
export function getMediaTypeKey(appType: AppType): string {
  switch (appType) {
    case 'radarr': return 'movies';
    case 'lidarr': return 'artists';
    case 'readarr': return 'authors';
    case 'sonarr':
    default: return 'series';
  }
}


// Helper to get configured instances for an app (filters out disabled or incomplete configs)
export function getConfiguredInstances<T extends { url: string; apiKey: string; enabled?: boolean }>(
  appConfigs: T[] | undefined
): T[] {
  if (!appConfigs || !Array.isArray(appConfigs)) {
    return [];
  }
  return appConfigs.filter((inst) => inst.url && inst.apiKey && inst.enabled !== false);
}

/**
 * Creates an axios client for Starr API calls
 */
export function createStarrClient(url: string, apiKey: string): AxiosInstance {
  return axios.create({
    baseURL: url,
    headers: {
      'X-Api-Key': apiKey,
      'Content-Type': 'application/json'
    }
  });
}

/**
 * Extracts items array from a search result object
 * Handles all media type keys (movies, series, artists, authors)
 */
export function extractItemsFromResult(result: {
  movies?: Array<{ id: number; title: string }>;
  series?: Array<{ id: number; title: string }>;
  artists?: Array<{ id: number; title: string }>;
  authors?: Array<{ id: number; title: string }>;
}): Array<{ id: number; title: string }> {
  return result.movies || result.series || result.artists || result.authors || [];
}

/**
 * Tests connection to a Starr application and verifies the app type matches
 * Returns an object with connection status, version info, and app name
 */
export async function testStarrConnection(
  url: string, 
  apiKey: string, 
  expectedApp: string
): Promise<{ success: boolean; version?: string; appName?: string; error?: string }> {
  logger.info(`🔌 [${expectedApp}] Testing connection`, { url });
  try {
    const client = createStarrClient(url, apiKey);
    const apiVersion = expectedApp.toLowerCase().includes('lidarr') || expectedApp.toLowerCase().includes('readarr') ? 'v1' : 'v3';
    
    const response = await client.get<{
      appName?: string;
      version?: string;
      instanceName?: string;
      [key: string]: unknown;
    }>(`/api/${apiVersion}/system/status`, { timeout: 5000 });
    
    const systemData = response.data;
    const actualAppName = systemData.appName;
    const version = systemData.version;
    const expectedAppName = capitalize(expectedApp.toLowerCase());
    
    if (!actualAppName) {
      logger.warn(`⚠️  [${expectedApp}] No appName in response`, { url });
      return {
        success: false,
        error: 'Unable to determine application type from server response'
      };
    }
    
    if (actualAppName.toLowerCase() !== expectedAppName.toLowerCase()) {
      logger.warn(`⚠️  [${expectedApp}] App type mismatch`, { 
        expected: expectedAppName, 
        actual: actualAppName 
      });
      return {
        success: false,
        appName: actualAppName,
        version,
        error: `Application type mismatch: Expected ${expectedAppName}, but got ${actualAppName}`
      };
    }
    
    logger.info(`✅ [${expectedApp}] Connected`, { version });
    
    return {
      success: true,
      appName: actualAppName,
      version
    };
  } catch (error: unknown) {
    const errorMessage = getErrorMessage(error);
    const errorStack = error instanceof Error ? error.stack : undefined;
    logger.error(`❌ [${expectedApp}] Connection test failed`, { 
      url, 
      error: errorMessage,
      stack: errorStack
    });
    return {
      success: false,
      error: errorMessage || 'Connection test failed'
    };
  }
}

/**
 * Gets or creates a tag ID
 * Lidarr and Readarr use v1 API, Radarr and Sonarr use v3
 */
export async function getOrCreateTagId(
  client: AxiosInstance,
  tagName: string,
  appName: string
): Promise<number | null> {
  try {
    const apiVersion = appName.toLowerCase().includes('lidarr') || appName.toLowerCase().includes('readarr') ? 'v1' : 'v3';
    
    const tagsResponse = await client.get<Array<{ id: number; label: string }>>(`/api/${apiVersion}/tag`);
    const allTags = tagsResponse.data;
    
    const tag = allTags.find(t => t.label === tagName);
    
    if (tag) {
      return tag.id;
    }

    logger.info(`🏷️  [${appName}] Creating new tag`, { tagName });
    const newTagResponse = await client.post<{ id: number; label: string }>(`/api/${apiVersion}/tag`, { label: tagName });
    const newTag = newTagResponse.data;
    logger.info(`✅ [${appName}] Tag created`, { tagName, tagId: newTag.id });
    return newTag.id;
  } catch (error: unknown) {
    const errorMessage = getErrorMessage(error);
    const errorStack = error instanceof Error ? error.stack : undefined;
    logger.error(`❌ [${appName}] Failed to get/create tag`, { 
      error: errorMessage,
      stack: errorStack,
      tagName 
    });
    throw error;
  }
}

