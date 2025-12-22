import axios, { AxiosInstance } from 'axios';
import logger from './logger.js';

// Helper to get configured instances for an app (handles both array and single legacy format)
export function getConfiguredInstances<T>(appConfig: T[] | any): T[] {
  return Array.isArray(appConfig)
    ? appConfig.filter((inst: any) => inst.url && inst.apiKey)
    : (appConfig?.url && appConfig?.apiKey ? [appConfig] : []);
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
    await client.get('/api/v3/system/status', { timeout: 5000 });
    logger.debug(`✅ ${appName} connection test successful`, { url });
    return true;
  } catch (error: any) {
    logger.debug(`❌ ${appName} connection test failed`, { url, error: error.message });
    return false;
  }
}

/**
 * Gets or creates a tag ID
 */
export async function getOrCreateTagId(
  client: AxiosInstance,
  tagName: string,
  appName: string
): Promise<number | null> {
  try {
    // Get all tags
    const tagsResponse = await client.get<Array<{ id: number; label: string }>>('/api/v3/tag');
    const tag = tagsResponse.data.find(t => t.label === tagName);
    
    if (tag) {
      logger.debug(`🏷️  Found existing tag in ${appName}`, { tagName, tagId: tag.id });
      return tag.id;
    }

    // Create tag if it doesn't exist
    const newTagResponse = await client.post<{ id: number; label: string }>('/api/v3/tag', { label: tagName });
    logger.debug(`🏷️  Created tag in ${appName}`, { tagName, tagId: newTagResponse.data.id });
    return newTagResponse.data.id;
  } catch (error: any) {
    logger.error(`❌ Failed to get/create tag in ${appName}`, { error: error.message, tagName });
    throw error;
  }
}

