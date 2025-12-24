import express from 'express';
import { statsService } from '../services/statsService.js';
import logger from '../utils/logger.js';

export const statsRouter = express.Router();

// Get stats (backward compatible - returns first 100 recent upgrades)
statsRouter.get('/', async (req, res) => {
  try {
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 100;
    const stats = await statsService.getStats(limit);
    res.json(stats);
  } catch (error: any) {
    logger.error('❌ Error getting stats', { error: error.message });
    res.status(500).json({ error: error.message });
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
  } catch (error: any) {
    logger.error('❌ Error getting recent upgrades', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

// Reset stats
statsRouter.post('/reset', async (req, res) => {
  try {
    await statsService.resetStats();
    res.json({ success: true, message: 'Stats reset successfully' });
  } catch (error: any) {
    logger.error('❌ Error resetting stats', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

// Clear recent upgrades only
statsRouter.post('/clear-recent', async (req, res) => {
  try {
    await statsService.clearRecentUpgrades();
    res.json({ success: true, message: 'Recent upgrades cleared successfully' });
  } catch (error: any) {
    logger.error('❌ Error clearing recent upgrades', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

