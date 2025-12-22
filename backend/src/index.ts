import express from 'express';
import cors from 'cors';
import { configRouter } from './routes/config.js';
import { searchRouter } from './routes/search.js';
import { statusRouter } from './routes/status.js';
import { statsRouter } from './routes/stats.js';
import { configService } from './services/configService.js';
import { statsService } from './services/statsService.js';
import { schedulerService } from './services/schedulerService.js';
import logger from './utils/logger.js';
import { requestLogger } from './middleware/requestLogger.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 5839;

// Middleware
app.use(cors());
app.use(express.json());
app.use(requestLogger);

// Serve static files from frontend
app.use(express.static(path.join(__dirname, '../../frontend/dist')));

// API routes
app.use('/api/config', configRouter);
app.use('/api/search', searchRouter);
app.use('/api/status', statusRouter);
app.use('/api/stats', statsRouter);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Serve frontend for all other routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../../frontend/dist/index.html'));
});

// Initialize services and start server
Promise.all([
  configService.initialize(),
  statsService.initialize()
]).then(async () => {
  await schedulerService.initialize();
  app.listen(PORT, () => {
    logger.info(`🚀 Server started successfully`, { port: PORT, environment: process.env.NODE_ENV || 'development' });
  });
}).catch((error) => {
  logger.error('❌ Failed to initialize services', { error: error.message, stack: error.stack });
  process.exit(1);
});

