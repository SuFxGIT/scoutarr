import express from 'express';
import { statsService } from '../services/statsService.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import logger from '../utils/logger.js';

export const statsRouter = express.Router();

// Get stats with recent searches (default limit: 100)
statsRouter.get('/', asyncHandler(async (req, res) => {
  logger.debug('📊 Stats requested', { limit: req.query.limit });
  const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 100;
  logger.debug('📊 Fetching stats', { limit });
  const stats = await statsService.getStats(limit);
  logger.debug('✅ Stats retrieved successfully', {
    totalSearches: stats.totalSearches,
    recentCount: stats.recentSearches.length
  });
  res.json(stats);
}));

// Get paginated recent searches (for unlimited records)
statsRouter.get('/recent', asyncHandler(async (req, res) => {
  const page = req.query.page ? parseInt(req.query.page as string, 10) : 1;
  const pageSize = req.query.pageSize ? parseInt(req.query.pageSize as string, 10) : 15;

  if (page < 1) {
    return res.status(400).json({ error: 'Page must be >= 1' });
  }
  if (pageSize < 1 || pageSize > 1000) {
    return res.status(400).json({ error: 'Page size must be between 1 and 1000' });
  }

  const result = await statsService.getRecentSearches(page, pageSize);
  res.json(result);
}));

// Reset stats
statsRouter.post('/reset', asyncHandler(async (req, res) => {
  logger.info('🔄 Stats reset requested');
  await statsService.resetStats();
  logger.info('✅ Stats reset completed');
  res.json({ success: true, message: 'Stats reset successfully' });
}));

// Clear recent searches only
statsRouter.post('/clear-recent', asyncHandler(async (req, res) => {
  await statsService.clearRecentSearches();
  res.json({ success: true, message: 'Recent searches cleared successfully' });
}));

// Clear data (recent searches and stats) - keeps database structure
statsRouter.post('/clear-data', asyncHandler(async (req, res) => {
  logger.info('🗑️  Clear data requested');
  await statsService.clearData();
  logger.info('✅ Data cleared successfully');
  res.json({ success: true, message: 'Recent searches and stats cleared successfully' });
}));
