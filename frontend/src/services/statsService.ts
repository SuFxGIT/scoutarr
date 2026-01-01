import apiClient from './apiClient';
import type { DashboardStats } from '../types/api';

/**
 * Service for managing statistics
 */
export const statsService = {
  /**
   * Fetch dashboard statistics
   */
  async getStats(): Promise<DashboardStats> {
    const response = await apiClient.get<DashboardStats>('/stats');
    return response.data;
  },

  /**
   * Clear recent activity
   */
  async clearRecentActivity(): Promise<void> {
    await apiClient.post('/stats/clear-recent');
  },

  /**
   * Clear all statistics data
   */
  async clearAllData(): Promise<void> {
    await apiClient.post('/stats/clear-data');
  },
};
