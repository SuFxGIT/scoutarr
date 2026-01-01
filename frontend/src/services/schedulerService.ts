import apiClient from './apiClient';
import type { SchedulerStatus, SyncSchedulerStatus } from '../types/api';

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
};
