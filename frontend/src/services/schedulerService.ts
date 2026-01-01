import apiClient from './apiClient';
import type { SchedulerStatus, SyncSchedulerStatus, SchedulerHistoryEntry } from '../types/api';

/**
 * Service for managing scheduler operations
 */
export const schedulerService = {
  /**
   * Get scheduler status
   */
  async getStatus(): Promise<{
    scheduler?: SchedulerStatus;
    sync?: SyncSchedulerStatus;
  }> {
    const response = await apiClient.get<{
      scheduler?: SchedulerStatus;
      sync?: SyncSchedulerStatus;
    }>('/status/scheduler');
    return response.data;
  },

  /**
   * Get scheduler history
   */
  async getHistory(): Promise<SchedulerHistoryEntry[]> {
    const response = await apiClient.get<SchedulerHistoryEntry[]>('/status/scheduler/history');
    return response.data;
  },

  /**
   * Manually trigger upgrade search
   */
  async runUpgradeSearch(): Promise<void> {
    await apiClient.post('/search/run');
  },

  /**
   * Manually trigger media library sync
   */
  async runMediaSync(): Promise<void> {
    await apiClient.post('/sync/all');
  },

  /**
   * Sync specific instance
   */
  async syncInstance(appType: string, instanceId: string): Promise<void> {
    await apiClient.post(`/sync/${appType}/${instanceId}`);
  },

  /**
   * Clear scheduler history
   */
  async clearHistory(): Promise<void> {
    await apiClient.post('/status/scheduler/history/clear');
  },
};
