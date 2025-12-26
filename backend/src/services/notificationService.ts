import axios from 'axios';
import { configService } from './configService.js';
import logger from '../utils/logger.js';
import { extractItemsFromResult } from '../utils/starrUtils.js';
import { SearchResults } from '@scoutarr/shared';
import { getErrorMessage } from '../utils/errorUtils.js';

class NotificationService {
  async sendNotifications(results: SearchResults, success: boolean, error?: string): Promise<void> {
    logger.debug('📤 Preparing to send notifications', { 
      success, 
      hasError: !!error,
      resultCount: Object.keys(results).length
    });
    const config = configService.getConfig();
    const notificationConfig = config.notifications;

    const totalSearched = Object.values(results).reduce((sum, result) => sum + (result.searched || 0), 0);
    logger.debug('📊 Notification summary', { 
      totalSearched,
      resultCount: Object.keys(results).length
    });

    let notificationsSent = 0;
    let notificationsFailed = 0;

    // Send Discord notification
    if (notificationConfig.discordWebhook) {
      logger.debug('📤 Sending Discord notification');
      try {
        await this.sendDiscordNotification(notificationConfig.discordWebhook, results, success, error);
        notificationsSent++;
        logger.debug('✅ Discord notification sent');
      } catch (err: unknown) {
        notificationsFailed++;
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
        logger.error('❌ Failed to send Discord notification', { error: errorMessage });
      }
    } else {
      logger.debug('⏸️  Discord webhook not configured, skipping');
    }

    // Send Notifiarr notification
    if (notificationConfig.notifiarrPassthroughWebhook) {
      logger.debug('📤 Sending Notifiarr notification');
      try {
        await this.sendNotifiarrNotification(
          notificationConfig.notifiarrPassthroughWebhook,
          notificationConfig.notifiarrPassthroughDiscordChannelId,
          results,
          success,
          error
        );
        notificationsSent++;
        logger.debug('✅ Notifiarr notification sent');
      } catch (err: unknown) {
        notificationsFailed++;
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
        logger.error('❌ Failed to send Notifiarr notification', { error: errorMessage });
      }
    } else {
      logger.debug('⏸️  Notifiarr webhook not configured, skipping');
    }

    // Send Pushover notification
    if (notificationConfig.pushoverUserKey && notificationConfig.pushoverApiToken) {
      logger.debug('📤 Sending Pushover notification');
      try {
        await this.sendPushoverNotification(
          notificationConfig.pushoverUserKey,
          notificationConfig.pushoverApiToken,
          results,
          success,
          error
        );
        notificationsSent++;
        logger.debug('✅ Pushover notification sent');
      } catch (err: unknown) {
        notificationsFailed++;
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
        logger.error('❌ Failed to send Pushover notification', { error: errorMessage });
      }
    } else {
      logger.debug('⏸️  Pushover not configured, skipping');
    }

    logger.info('📤 Notification sending complete', { 
      sent: notificationsSent, 
      failed: notificationsFailed,
      totalConfigured: (notificationConfig.discordWebhook ? 1 : 0) + 
                       (notificationConfig.notifiarrPassthroughWebhook ? 1 : 0) + 
                       (notificationConfig.pushoverUserKey && notificationConfig.pushoverApiToken ? 1 : 0)
    });
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
            const items = extractItemsFromResult(result);
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

      logger.debug('📤 Sending Discord webhook request', { webhookUrl: webhookUrl.substring(0, 50) + '...' });
      await axios.post(webhookUrl, {
        embeds: [embed]
      });

      logger.debug('✅ Discord notification sent successfully');
    } catch (error: unknown) {
      const errorMessage = getErrorMessage(error);
      logger.error('❌ Failed to send Discord notification', {
        error: errorMessage
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

      logger.debug('📤 Sending Notifiarr webhook request', { webhookUrl: webhookUrl.substring(0, 50) + '...' });
      await axios.post(webhookUrl, payload);

      logger.debug('✅ Notifiarr notification sent successfully');
    } catch (error: unknown) {
      const errorMessage = getErrorMessage(error);
      logger.error('❌ Failed to send Notifiarr notification', {
        error: errorMessage
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
            const items = extractItemsFromResult(result);
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

      logger.debug('📤 Sending Pushover notification request');
      await axios.post('https://api.pushover.net/1/messages.json', params.toString(), {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      });

      logger.debug('✅ Pushover notification sent successfully');
    } catch (error: unknown) {
      const errorMessage = getErrorMessage(error);
      logger.error('❌ Failed to send Pushover notification', {
        error: errorMessage
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
