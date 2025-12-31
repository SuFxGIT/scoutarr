import express from 'express';
import cors from 'cors';
import { Server } from 'http';
import { configRouter } from './routes/config.js';
import { searchRouter } from './routes/search.js';
import { statusRouter } from './routes/status.js';
import { statsRouter } from './routes/stats.js';
import { mediaLibraryRouter } from './routes/mediaLibrary.js';
import { syncRouter } from './routes/sync.js';
import { configService } from './services/configService.js';
import { statsService } from './services/statsService.js';
import { schedulerService } from './services/schedulerService.js';
import { getErrorMessage } from './utils/errorUtils.js';
import logger, { startOperation } from './utils/logger.js';
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
app.use('/api/media-library', mediaLibraryRouter);
app.use('/api/sync', syncRouter);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Serve frontend for all other routes (SPA fallback)
app.use((req, res) => {
  res.sendFile(path.join(__dirname, '../../frontend/dist/index.html'));
});

// Initialize services and start server
let server: Server | null = null;

logger.info('🚀 Starting application initialization', {
  port: PORT,
  environment: process.env.NODE_ENV || 'development',
  nodeVersion: process.version
});

Promise.all([
  configService.initialize(),
  statsService.initialize()
]).then(async () => {
  logger.debug('✅ Core services initialized, initializing schedulers');
  const initOp = startOperation('App.initializeServices', {});
  await schedulerService.initialize();

  // Initialize sync scheduler (skip initial sync, only run on scheduled intervals)
  const { syncSchedulerService } = await import('./services/syncSchedulerService.js');
  syncSchedulerService.start(true); // Skip initial sync on startup

  logger.debug('📡 Starting HTTP server', { port: PORT });
  server = app.listen(PORT, () => {
    logger.info(`🚀 Server started successfully`, {
      port: PORT,
      environment: process.env.NODE_ENV || 'development',
      pid: process.pid
    });
  });
  initOp({}, true);
}).catch((error: unknown) => {
  const errorMessage = getErrorMessage(error);
  const errorStack = error instanceof Error ? error.stack : undefined;
  const errorName = error instanceof Error ? error.name : 'Error';
  
  logger.error('❌ Failed to initialize services', { 
    error: errorMessage,
    errorName,
    stack: errorStack,
    port: PORT,
    nodeVersion: process.version
  });
  
  console.error('\n=== INITIALIZATION ERROR ===');
  console.error('Message:', errorMessage);
  console.error('Type:', errorName);
  if (errorStack) {
    console.error('Stack trace:', errorStack);
  }
  console.error('===========================\n');
  
  process.exit(1);
});

// Graceful shutdown
const shutdown = async (signal: string) => {
  logger.info(`📴 Received ${signal}, shutting down gracefully...`, { signal, pid: process.pid });
  
  if (server) {
    logger.debug('🔄 Closing HTTP server connections');
    server.close(() => {
      logger.info('✅ HTTP server closed');
    });
  } else {
    logger.debug('ℹ️  No HTTP server to close');
  }
  
  // Close database connections
  logger.debug('🔄 Closing database connections');
  statsService.close();
  logger.debug('✅ Database connections closed');
  
  logger.info('👋 Shutdown complete');
  process.exit(0);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

