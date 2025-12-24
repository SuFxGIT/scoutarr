import axios from 'axios';
import { configService } from './configService.js';
import logger from '../utils/logger.js';

interface SearchResults {
  [key: string]: {
    success: boolean;
    searched?: number;
    count?: number;
    total?: number;
    movies?: Array<{ id: number; title: string }>;
    series?: Array<{ id: number; title: string }>;
    artists?: Array<{ id: number; title: string }>;
    authors?: Array<{ id: number; title: string }>;
    items?: Array<{ id: number; title: string }>;
    error?: string;
    instanceName?: string;
  };
}

class NotificationService {
  async sendNotifications(results: SearchResults, success: boolean, error?: string): Promise<void> {
    const config = configService.getConfig();
    const notificationConfig = config.notifications;

    // Send Discord notification
    if (notificationConfig.discordWebhook) {
      await this.sendDiscordNotification(notificationConfig.discordWebhook, results, success, error);
    }

    // Send Notifiarr notification
    if (notificationConfig.notifiarrPassthroughWebhook) {
      await this.sendNotifiarrNotification(
        notificationConfig.notifiarrPassthroughWebhook,
        notificationConfig.notifiarrPassthroughDiscordChannelId,
        results,
        success,
        error
      );
    }

    // Send Pushover notification
    if (notificationConfig.pushoverUserKey && notificationConfig.pushoverApiToken) {
      await this.sendPushoverNotification(
        notificationConfig.pushoverUserKey,
        notificationConfig.pushoverApiToken,
        results,
        success,
        error
      );
    }
  }

  private async sendDiscordNotification(
    webhookUrl: string,
    results: SearchResults,
    success: boolean,
    error?: string
  ): Promise<void> {
    try {
      const totalSearched = Object.values(results).reduce((sum, result) => sum + (result.searched || 0), 0);
      
      let description = '';
      if (error) {
        description = `❌ Search failed: ${error}`;
      } else if (totalSearched === 0) {
        description = 'ℹ️ No items were searched';
      } else {
        const resultLines = Object.entries(results)
          .filter(([_, result]) => result.success && (result.searched || 0) > 0)
          .map(([app, result]) => {
            const appName = this.formatAppName(app);
            const items = result.movies || result.series || result.artists || result.authors || result.items || [];
            const itemList = items.slice(0, 5).map(item => item.title).join(', ');
            const more = items.length > 5 ? ` (+${items.length - 5} more)` : '';
            return `**${appName}**: ${result.searched} item(s) - ${itemList}${more}`;
          });
        description = resultLines.join('\n') || 'No items were searched';
      }

      const embed = {
        title: success ? '✅ Scoutarr Search Completed' : '❌ Scoutarr Search Failed',
        description,
        color: success ? 0x00ff00 : 0xff0000,
        timestamp: new Date().toISOString(),
      };

      await axios.post(webhookUrl, {
        embeds: [embed]
      });

      logger.debug('📤 Discord notification sent');
    } catch (error: any) {
      logger.error('❌ Failed to send Discord notification', {
        error: error.message
      });
    }
  }

  private async sendNotifiarrNotification(
    webhookUrl: string,
    channelId: string,
    results: SearchResults,
    success: boolean,
    error?: string
  ): Promise<void> {
    try {
      const totalSearched = Object.values(results).reduce((sum, result) => sum + (result.searched || 0), 0);
      
      let message = '';
      if (error) {
        message = `❌ Scoutarr search failed: ${error}`;
      } else if (totalSearched === 0) {
        message = 'ℹ️ Scoutarr: No items were searched';
      } else {
        const resultLines = Object.entries(results)
          .filter(([_, result]) => result.success && (result.searched || 0) > 0)
          .map(([app, result]) => {
            const appName = this.formatAppName(app);
            return `${appName}: ${result.searched} item(s)`;
          });
        message = `✅ Scoutarr search completed:\n${resultLines.join('\n')}`;
      }

      const payload = {
        channel: channelId || undefined,
        event: 'scoutarr',
        message: message,
        title: success ? 'Scoutarr Search Completed' : 'Scoutarr Search Failed'
      };

      await axios.post(webhookUrl, payload);

      logger.debug('📤 Notifiarr notification sent');
    } catch (error: any) {
      logger.error('❌ Failed to send Notifiarr notification', {
        error: error.message
      });
    }
  }

  private async sendPushoverNotification(
    userKey: string,
    apiToken: string,
    results: SearchResults,
    success: boolean,
    error?: string
  ): Promise<void> {
    try {
      const totalSearched = Object.values(results).reduce((sum, result) => sum + (result.searched || 0), 0);
      
      let title = success ? '✅ Scoutarr Search Completed' : '❌ Scoutarr Search Failed';
      let message = '';
      
      if (error) {
        message = `Search failed: ${error}`;
      } else if (totalSearched === 0) {
        message = 'No items were searched';
      } else {
        const resultLines = Object.entries(results)
          .filter(([_, result]) => result.success && (result.searched || 0) > 0)
          .map(([app, result]) => {
            const appName = this.formatAppName(app);
            const items = result.movies || result.series || result.artists || result.authors || result.items || [];
            const itemList = items.slice(0, 3).map(item => item.title).join(', ');
            const more = items.length > 3 ? ` (+${items.length - 3} more)` : '';
            return `${appName}: ${result.searched} item(s) - ${itemList}${more}`;
          });
        message = resultLines.join('\n') || 'No items were searched';
      }

      const params = new URLSearchParams();
      params.append('token', apiToken);
      params.append('user', userKey);
      params.append('title', title);
      params.append('message', message);
      params.append('priority', success ? '0' : '1'); // Normal priority for success, high priority for failures

      await axios.post('https://api.pushover.net/1/messages.json', params.toString(), {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      });

      logger.debug('📤 Pushover notification sent');
    } catch (error: any) {
      logger.error('❌ Failed to send Pushover notification', {
        error: error.message
      });
    }
  }

  private formatAppName(app: string): string {
    // Convert "radarr" -> "Radarr", "sonarr-instance-id" -> "Sonarr (instance-id)"
    const parts = app.split('-');
    const appType = parts[0];
    const instanceId = parts.length > 1 ? parts.slice(1).join('-') : null;
    
    const appName = appType.charAt(0).toUpperCase() + appType.slice(1);
    return instanceId ? `${appName} (${instanceId})` : appName;
  }
}

export const notificationService = new NotificationService();

