import cron from 'node-cron';
import { createRequire } from 'module';
import { configService } from './configService.js';
import logger from '../utils/logger.js';
import { executeSearchRun } from '../routes/search.js';

// cron-parser is a CommonJS module, use createRequire to import it
const require = createRequire(import.meta.url);
const { parseExpression } = require('cron-parser');

interface SchedulerRunHistory {
  timestamp: string;
  results: Record<string, any>;
  success: boolean;
  error?: string;
}

class SchedulerService {
  private task: cron.ScheduledTask | null = null;
  private isRunning = false;
  private runHistory: SchedulerRunHistory[] = [];
  private maxHistorySize = 100;

  async initialize(): Promise<void> {
    const config = configService.getConfig();
    if (config.scheduler?.enabled && config.scheduler?.schedule) {
      this.start(config.scheduler.schedule);
      logger.info('✅ Scheduler initialized', { schedule: config.scheduler.schedule });
    } else {
      logger.info('ℹ️  Scheduler disabled');
    }
  }

  start(schedule: string): void {
    this.stop(); // Stop existing task if any

    if (!cron.validate(schedule)) {
      logger.error('❌ Invalid cron schedule', { schedule });
      return;
    }

    this.task = cron.schedule(schedule, async () => {
      if (this.isRunning) {
        logger.warn('⏸️  Previous search still running, skipping scheduled run');
        return;
      }

      this.isRunning = true;
      logger.info('⏰ Scheduled search triggered', { schedule });

      try {
        // Call the same function that the "Run Search" button uses
        const results = await executeSearchRun();

        // Store in history
        const historyEntry: SchedulerRunHistory = {
          timestamp: new Date().toISOString(),
          results,
          success: true
        };
        this.addToHistory(historyEntry);

        logger.info('✅ Scheduled search completed', { 
          results: Object.keys(results).map(app => ({
            app,
            success: results[app].success,
            count: results[app].searched || 0
          }))
        });
      } catch (error: any) {
        // Store error in history
        const historyEntry: SchedulerRunHistory = {
          timestamp: new Date().toISOString(),
          results: {},
          success: false,
          error: error.message
        };
        this.addToHistory(historyEntry);

        logger.error('❌ Scheduled search failed', { 
          error: error.message,
          stack: error.stack
        });
      } finally {
        this.isRunning = false;
      }
    }, {
      scheduled: true,
      timezone: 'UTC'
    });

    logger.info('🕐 Scheduler started', { schedule });
  }

  stop(): void {
    if (this.task) {
      this.task.stop();
      this.task = null;
      logger.info('⏹️  Scheduler stopped');
    }
  }

  restart(): void {
    const config = configService.getConfig();
    if (config.scheduler?.enabled && config.scheduler?.schedule) {
      this.start(config.scheduler.schedule);
    } else {
      this.stop();
    }
  }

  private addToHistory(entry: SchedulerRunHistory): void {
    this.runHistory.unshift(entry);
    if (this.runHistory.length > this.maxHistorySize) {
      this.runHistory = this.runHistory.slice(0, this.maxHistorySize);
    }
  }

  getHistory(): SchedulerRunHistory[] {
    return [...this.runHistory];
  }

  clearHistory(): void {
    this.runHistory = [];
  }

  getNextRunTime(schedule: string): Date | null {
    if (!schedule) {
      return null;
    }

    try {
      const interval = parseExpression(schedule, {
        tz: 'UTC'
      });
      return interval.next().toDate();
    } catch (error: any) {
      logger.debug('Could not parse cron for next run time', { schedule, error: error.message });
      return null;
    }
  }

  getStatus(): { running: boolean; schedule: string | null; nextRun: string | null } {
    const schedule = configService.getConfig().scheduler?.schedule || null;
    const nextRun = schedule ? this.getNextRunTime(schedule) : null;
    
    return {
      running: this.task !== null,
      schedule,
      nextRun: nextRun ? nextRun.toISOString() : null
    };
  }
}

export const schedulerService = new SchedulerService();

