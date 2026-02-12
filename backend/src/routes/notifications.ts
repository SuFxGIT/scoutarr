import express from 'express';
import { notificationService } from '../services/notificationService.js';
import { handleRouteError } from '../utils/errorUtils.js';

export const notificationsRouter = express.Router();

// POST /api/notifications/test
notificationsRouter.post('/test', async (req, res) => {
  try {
    const { method } = req.body;

    if (!method || !['discord', 'notifiarr', 'pushover'].includes(method)) {
      return res.status(400).json({ error: 'Invalid method. Must be discord, notifiarr, or pushover.' });
    }

    await notificationService.sendTestNotification(method);
    res.json({ success: true });
  } catch (error: unknown) {
    handleRouteError(res, error, 'Failed to send test notification');
  }
});
