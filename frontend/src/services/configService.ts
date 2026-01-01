import apiClient from './apiClient';
import type { Config } from '../types/config';

/**
 * Service for managing application configuration
 */
export const configService = {
  /**
   * Fetch current configuration
   */
  async getConfig(): Promise<Config> {
    const response = await apiClient.get<Config>('/config');
    return response.data;
  },

  /**
   * Update configuration
   */
  async updateConfig(config: Config): Promise<void> {
    await apiClient.put('/config', config);
  },

  /**
   * Reset application instance (clear tags/quality profiles)
   */
  async resetAppInstance(app: string): Promise<void> {
    await apiClient.post(`/config/reset-app`, { app });
  },

  /**
   * Clear tags for a specific instance
   */
  async clearTags(app: string, instanceId: string): Promise<void> {
    await apiClient.post(`/config/clear-tags/${app}/${instanceId}`);
  },

  /**
   * Fetch quality profiles for an instance from database
   */
  async getQualityProfiles(
    app: string,
    instanceId: string
  ): Promise<{ id: number; name: string }[]> {
    const response = await apiClient.get<{ id: number; name: string }[]>(
      `/config/quality-profiles/${app}/${instanceId}`
    );
    return response.data;
  },

  /**
   * Test connection to an instance
   */
  async testConnection(
    app: string,
    url: string,
    apiKey: string,
    instanceId?: string
  ): Promise<{ success: boolean; version?: string; appName?: string; error?: string }> {
    const response = await apiClient.post<{
      success: boolean;
      version?: string;
      appName?: string;
      error?: string
    }>(`/config/test/${app}`, { url, apiKey, instanceId });
    return response.data;
  },
};
