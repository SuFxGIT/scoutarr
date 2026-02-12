import apiClient from './apiClient';

export const notificationService = {
  async testNotification(method: 'discord' | 'notifiarr' | 'pushover'): Promise<void> {
    await apiClient.post('/notifications/test', { method });
  },
};
