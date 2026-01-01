import express from 'express';
import { syncSchedulerService } from '../services/syncSchedulerService.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import logger from '../utils/logger.js';
import { getErrorMessage } from '../utils/errorUtils.js';

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
    logger.error('❌ Background sync failed', { error: getErrorMessage(error) });
  });

  res.json({
    success: true,
    message: 'Sync started'
  });
}));
