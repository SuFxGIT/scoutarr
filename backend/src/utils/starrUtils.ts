import axios, { AxiosInstance } from 'axios';
import logger from './logger.js';

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
 * Tests connection to a Starr application
 */
export async function testStarrConnection(url: string, apiKey: string, appName: string): Promise<boolean> {
  try {
    const client = createStarrClient(url, apiKey);
    // Lidarr and Readarr use v1 API, Radarr and Sonarr use v3
    const apiVersion = appName.toLowerCase().includes('lidarr') || appName.toLowerCase().includes('readarr') ? 'v1' : 'v3';
    await client.get(`/api/${apiVersion}/system/status`, { timeout: 5000 });
    logger.debug(`✅ ${appName} connection test successful`, { url });
    return true;
  } catch (error: any) {
    logger.debug(`❌ ${appName} connection test failed`, { url, error: error.message });
    return false;
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
    // Determine API version based on app name
    const apiVersion = appName.toLowerCase().includes('lidarr') || appName.toLowerCase().includes('readarr') ? 'v1' : 'v3';
    
    // Get all tags
    const tagsResponse = await client.get<Array<{ id: number; label: string }>>(`/api/${apiVersion}/tag`);
    const tag = tagsResponse.data.find(t => t.label === tagName);
    
    if (tag) {
      logger.debug(`🏷️  Found existing tag in ${appName}`, { tagName, tagId: tag.id });
      return tag.id;
    }

    // Create tag if it doesn't exist
    const newTagResponse = await client.post<{ id: number; label: string }>(`/api/${apiVersion}/tag`, { label: tagName });
    logger.debug(`🏷️  Created tag in ${appName}`, { tagName, tagId: newTagResponse.data.id });
    return newTagResponse.data.id;
  } catch (error: any) {
    logger.error(`❌ Failed to get/create tag in ${appName}`, { error: error.message, tagName });
    throw error;
  }
}

