import express from 'express';
import { syncSchedulerService } from '../services/syncSchedulerService.js';
import { APP_TYPES, AppType } from '../utils/starrUtils.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import logger from '../utils/logger.js';

export const syncRouter = express.Router();

// POST /api/sync/all
// Trigger sync for all instances
syncRouter.post('/all', asyncHandler(async (req, res) => {
  logger.info('🔄 Manual sync triggered for all instances');

  if (syncSchedulerService.isSyncRunning()) {
    return res.status(429).json({
      success: false,
      message: 'Sync already in progress'
    });
  }

  // Trigger sync in background
  syncSchedulerService.syncAllInstances().catch((error: unknown) => {
    logger.error('❌ Background sync failed', {
      error: error instanceof Error ? error.message : error
    });
  });

  res.json({
    success: true,
    message: 'Sync started'
  });
}));

// POST /api/sync/:appType/:instanceId
// Trigger sync for a specific instance
syncRouter.post('/:appType/:instanceId', asyncHandler(async (req, res) => {
  const { appType, instanceId } = req.params;

  // Validate appType
  if (!APP_TYPES.includes(appType as AppType)) {
    return res.status(400).json({ error: 'Invalid app type' });
  }

  logger.info(`🔄 Manual sync triggered for ${appType} instance: ${instanceId}`);

  // Trigger sync
  await syncSchedulerService.syncInstance(appType as AppType, instanceId);

  res.json({
    success: true,
    message: `Sync completed for ${appType} instance ${instanceId}`
  });
}));

// GET /api/sync/status
// Get sync status
syncRouter.get('/status', (req, res) => {
  res.json({
    isRunning: syncSchedulerService.isSyncRunning()
  });
});
