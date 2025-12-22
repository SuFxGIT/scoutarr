import express from 'express';
import { statsService } from '../services/statsService.js';
import logger from '../utils/logger.js';

export const statsRouter = express.Router();

// Get stats
statsRouter.get('/', async (req, res) => {
  try {
    const stats = statsService.getStats();
    res.json(stats);
  } catch (error: any) {
    logger.error('❌ Error getting stats', { error: error.message });
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

