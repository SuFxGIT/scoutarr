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
  private timeoutTimer: NodeJS.Timeout | null = null;
  private intervalTimer: NodeJS.Timeout | null = null;
  private nextRunTime: Date | null = null;
  private currentSchedule: string | null = null;
  private usingInterval = false;
  private intervalMs: number | null = null;

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
    // Stop any existing timers / cron tasks
    this.stop();

    if (!cron.validate(schedule)) {
      logger.error('❌ Invalid cron schedule', { schedule });
      return;
    }

    this.currentSchedule = schedule;

    // Try to treat common "every N minutes/hours" presets as true intervals so that
    // the first run happens exactly N units from now, and then every N thereafter.
    const intervalMs = this.getIntervalMsForSchedule(schedule);

    if (intervalMs !== null) {
      // Interval-based scheduling
      this.usingInterval = true;
      this.intervalMs = intervalMs;

      const now = Date.now();
      this.nextRunTime = new Date(now + intervalMs);

      // First run: exactly intervalMs from now
      this.timeoutTimer = setTimeout(async () => {
        await this.runScheduledSearch(schedule);

        // Subsequent runs: every intervalMs
        this.intervalTimer = setInterval(async () => {
          await this.runScheduledSearch(schedule);
        }, intervalMs);

        // Next run will be intervalMs from whenever the interval callback fires
        this.nextRunTime = new Date(Date.now() + intervalMs);
      }, intervalMs);

      logger.info('🕐 Interval scheduler started', { schedule, intervalMs });
      return;
    }

    // Fallback: pure cron-based scheduling (for custom / complex expressions)
    this.usingInterval = false;
    this.intervalMs = null;
    this.nextRunTime = this.getNextRunTime(schedule);

    this.task = cron.schedule(
      schedule,
      async () => {
        await this.runScheduledSearch(schedule);
        // Update next run time after each cron trigger
        this.nextRunTime = this.getNextRunTime(schedule);
      },
      {
        scheduled: true,
        timezone: 'UTC'
      }
    );

    logger.info('🕐 Cron scheduler started', { schedule });
  }

  stop(): void {
    if (this.task) {
      this.task.stop();
      this.task = null;
    }

    if (this.timeoutTimer) {
      clearTimeout(this.timeoutTimer);
      this.timeoutTimer = null;
    }

    if (this.intervalTimer) {
      clearInterval(this.intervalTimer);
      this.intervalTimer = null;
    }

    this.usingInterval = false;
    this.intervalMs = null;
    this.nextRunTime = null;
    this.currentSchedule = null;

    logger.info('⏹️  Scheduler stopped');
  }

  restart(): void {
    const config = configService.getConfig();
    if (config.scheduler?.enabled && config.scheduler?.schedule) {
      this.start(config.scheduler.schedule);
    } else {
      this.stop();
    }
  }

  addToHistory(entry: SchedulerRunHistory): void {
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
    // If we're running in interval mode, we explicitly track nextRunTime
    if (this.usingInterval && this.nextRunTime) {
      return this.nextRunTime;
    }

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
    const schedule = this.currentSchedule || configService.getConfig().scheduler?.schedule || null;
    const nextRun = schedule ? this.getNextRunTime(schedule) : null;
    
    return {
      running: !!(this.task || this.timeoutTimer || this.intervalTimer),
      schedule,
      nextRun: nextRun ? nextRun.toISOString() : null
    };
  }

  /**
   * Map known "every N" cron presets to a fixed interval in milliseconds.
   * This lets us run "exactly N minutes/hours from now, then every N" instead
   * of aligning to the wall clock like normal cron.
   */
  private getIntervalMsForSchedule(schedule: string): number | null {
    switch (schedule) {
      // Every 1 minute
      case '*/1 * * * *':
        return 60 * 1000;
      // Every 10 minutes
      case '*/10 * * * *':
        return 10 * 60 * 1000;
      // Every 30 minutes
      case '*/30 * * * *':
        return 30 * 60 * 1000;
      // Every hour
      case '0 * * * *':
        return 60 * 60 * 1000;
      // Every 6 hours
      case '0 */6 * * *':
        return 6 * 60 * 60 * 1000;
      // Every 12 hours
      case '0 */12 * * *':
        return 12 * 60 * 60 * 1000;
      default:
        return null;
    }
  }

  /**
   * Shared execution logic for both cron-based and interval-based scheduling.
   */
  private async runScheduledSearch(schedule: string): Promise<void> {
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

      // For interval-based scheduling, always compute the next run relative to "now"
      if (this.usingInterval && this.intervalMs) {
        this.nextRunTime = new Date(Date.now() + this.intervalMs);
      }
    }
  }
}

export const schedulerService = new SchedulerService();

