import express from 'express';
import { statsService } from '../services/statsService.js';
import logger from '../utils/logger.js';

export const statsRouter = express.Router();

// Get stats (backward compatible - returns first 100 recent upgrades)
statsRouter.get('/', async (req, res) => {
  logger.debug('📊 Stats requested', { limit: req.query.limit });
  try {
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 100;
    logger.debug('📊 Fetching stats', { limit });
    const stats = await statsService.getStats(limit);
    logger.debug('✅ Stats retrieved successfully', { 
      totalUpgrades: stats.totalUpgrades,
      recentCount: stats.recentUpgrades.length
    });
    res.json(stats);
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('❌ Error getting stats', { error: errorMessage });
    res.status(500).json({ error: errorMessage });
  }
});

// Get paginated recent upgrades (for unlimited records)
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
    
    const result = await statsService.getRecentUpgrades(page, pageSize);
    res.json(result);
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('❌ Error getting recent upgrades', { error: errorMessage });
    res.status(500).json({ error: errorMessage });
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
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('❌ Error resetting stats', { error: errorMessage });
    res.status(500).json({ error: errorMessage });
  }
});

// Clear recent upgrades only
statsRouter.post('/clear-recent', async (req, res) => {
  try {
    await statsService.clearRecentUpgrades();
    res.json({ success: true, message: 'Recent upgrades cleared successfully' });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('❌ Error clearing recent upgrades', { error: errorMessage });
    res.status(500).json({ error: errorMessage });
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
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('❌ Error clearing data', { error: errorMessage });
    res.status(500).json({ error: errorMessage });
  }
});
