import express from 'express';
import { statsService } from '../services/statsService.js';
import { handleRouteError } from '../utils/errorUtils.js';
import logger from '../utils/logger.js';

export const statsRouter = express.Router();

// Get stats (backward compatible - returns first 100 recent triggers)
statsRouter.get('/', async (req, res) => {
  logger.debug('📊 Stats requested', { limit: req.query.limit });
  try {
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 100;
    logger.debug('📊 Fetching stats', { limit });
    const stats = await statsService.getStats(limit);
    logger.debug('✅ Stats retrieved successfully', { 
      totalTriggers: stats.totalTriggers,
      recentCount: stats.recentTriggers.length
    });
    res.json(stats);
  } catch (error: unknown) {
    handleRouteError(res, error, 'Failed to get stats');
  }
});

// Get paginated recent triggers (for unlimited records)
statsRouter.get('/recent', async (req, res) => {
  try {
    const page = req.query.page ? parseInt(req.query.page as string, 10) : 1;
    const pageSize = req.query.pageSize ? parseInt(req.query.pageSize as string, 10) : 15;

    if (page < 1) {
      return res.status(400).json({ error: 'Page must be >= 1' });
    }
    if (pageSize < 1 || pageSize > 1000) {
      return res.status(400).json({ error: 'Page size must be between 1 and 1000' });
    }

    const result = await statsService.getRecentTriggers(page, pageSize);
    res.json(result);
  } catch (error: unknown) {
    handleRouteError(res, error, 'Failed to get recent triggers');
  }
});

// Reset stats
statsRouter.post('/reset', async (req, res) => {
  logger.info('🔄 Stats reset requested');
  try {
    await statsService.resetStats();
    logger.info('✅ Stats reset completed');
    res.json({ success: true, message: 'Stats reset successfully' });
  } catch (error: unknown) {
    handleRouteError(res, error, 'Failed to reset stats');
  }
});

// Clear recent triggers only
statsRouter.post('/clear-recent', async (req, res) => {
  try {
    await statsService.clearRecentTriggers();
    res.json({ success: true, message: 'Recent triggers cleared successfully' });
  } catch (error: unknown) {
    handleRouteError(res, error, 'Failed to clear recent triggers');
  }
});

// Clear data (recent triggers and stats) - keeps database structure
statsRouter.post('/clear-data', async (req, res) => {
  logger.info('🗑️  Clear data requested');
  try {
    await statsService.clearData();
    logger.info('✅ Data cleared successfully');
    res.json({ success: true, message: 'Recent triggers and stats cleared successfully' });
  } catch (error: unknown) {
    handleRouteError(res, error, 'Failed to clear data');
  }
});
