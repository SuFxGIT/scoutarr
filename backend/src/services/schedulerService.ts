import { createRequire } from 'module';
import { configService } from './configService.js';
import { notificationService } from './notificationService.js';
import logger, { startOperation } from '../utils/logger.js';
import { executeSearchRun } from '../routes/search.js';
import { SearchResults, Config } from '@scoutarr/shared';
import { getErrorMessage } from '../utils/errorUtils.js';

/**
 * Import CommonJS modules using createRequire
 * - cron-parser: Used for validation and calculating next run times
 * - node-cron: Used for actual task scheduling
 */
const require = createRequire(import.meta.url);
const { CronExpressionParser } = require('cron-parser');
const cron = require('node-cron');

/** Type for node-cron ScheduledTask */
interface ScheduledTask {
  start: () => void;
  stop: () => void;
}

interface SchedulerRunHistory {
  timestamp: string;
  results: SearchResults;
  success: boolean;
  error?: string;
}

class SchedulerService {
  private globalTask: ScheduledTask | null = null;
  private globalIsRunning = false;
  private globalCurrentSchedule: string | null = null;

  private runHistory: SchedulerRunHistory[] = [];
  private maxHistorySize = 100;

  /**
   * Helper to send notifications, swallowing errors
   */
  private async sendNotifications(results: SearchResults, success: boolean, error?: string): Promise<void> {
    try {
      await notificationService.sendNotifications(results, success, error);
    } catch (err: unknown) {
      logger.debug('Failed to send notifications', { error: getErrorMessage(err) });
    }
  }

  async initialize(): Promise<void> {
    logger.debug('⚙️  Initializing scheduler service');
    const config = configService.getConfig();
    
    if (config.scheduler?.enabled && config.scheduler?.schedule) {
      logger.debug('🕐 Global scheduler enabled, starting', { schedule: config.scheduler.schedule });
      this.startGlobal(config.scheduler.schedule);
      logger.info('✅ Global scheduler initialized', { schedule: config.scheduler.schedule });
    } else {
      logger.info('ℹ️  Global scheduler disabled', {
        enabled: config.scheduler?.enabled || false,
        hasSchedule: !!config.scheduler?.schedule
      });
    }

    logger.debug('✅ Scheduler service initialization complete');
  }

  startGlobal(schedule: string): void {
    this.stopGlobal();

    // Validate using cron-parser
    try {
      CronExpressionParser.parse(schedule);
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      const errorStack = error instanceof Error ? error.stack : undefined;
      const errorName = error instanceof Error ? error.name : 'Error';
      
      logger.error('❌ Invalid cron schedule', { 
        schedule,
        error: errorMessage,
        errorName,
        stack: errorStack
      });
      throw new Error(`Invalid scheduler cron expression "${schedule}": ${errorMessage}`);
    }

    this.globalCurrentSchedule = schedule;

    this.globalTask = cron.schedule(
      schedule,
      async () => {
        await this.runGlobalScheduledSearch(schedule);
      },
      {
        timezone: 'UTC'
      }
    );

    logger.info('🕐 Global scheduler started', { schedule });
  }

  stopGlobal(): void {
    if (this.globalTask) {
      this.globalTask.stop();
      this.globalTask = null;
    }
    this.globalCurrentSchedule = null;
  }

  restart(): void {
    logger.info('🔄 Restarting scheduler service');
    const config = configService.getConfig();

    if (config.scheduler?.enabled && config.scheduler?.schedule) {
      logger.debug('🕐 Global scheduler enabled, restarting', { schedule: config.scheduler.schedule });
      this.startGlobal(config.scheduler.schedule);
    } else {
      logger.debug('⏸️  Global scheduler disabled, stopping');
      this.stopGlobal();
    }

    logger.info('✅ Scheduler service restarted');
  }

  private async runGlobalScheduledSearch(schedule: string): Promise<void> {
    if (this.globalIsRunning) {
      logger.warn('⏸️  Previous global search still running, skipping scheduled run');
      return;
    }

    this.globalIsRunning = true;
    logger.info('⏰ Global scheduled search started', { schedule });

    try {
      const endOp = startOperation('SchedulerService.runGlobalScheduledSearch', { schedule });
      const results = await executeSearchRun();
      const historyEntry: SchedulerRunHistory = {
        timestamp: new Date().toISOString(),
        results,
        success: true
      };
      this.addToHistory(historyEntry);

      logger.info('✅ Global scheduled search completed', {
        results: Object.keys(results).map(app => ({
          app,
          success: results[app].success,
          count: results[app].searched || 0
        }))
      });

      await this.sendNotifications(results, true);
      endOp({ totalSearched: Object.values(results).reduce((s, r) => s + (r.searched || 0), 0) }, true);
    } catch (error: unknown) {
      const errorMessage = getErrorMessage(error);
      const errorStack = error instanceof Error ? error.stack : undefined;
      const historyEntry: SchedulerRunHistory = {
        timestamp: new Date().toISOString(),
        results: {},
        success: false,
        error: errorMessage
      };
      this.addToHistory(historyEntry);

      logger.error('❌ Global scheduled search failed', { error: errorMessage, stack: errorStack });
      await this.sendNotifications({}, false, errorMessage);
    } finally {
      this.globalIsRunning = false;
    }
  }

  addToHistory(entry: SchedulerRunHistory): void {
    logger.debug('📝 Adding entry to scheduler history', {
      success: entry.success,
      timestamp: entry.timestamp,
      resultCount: Object.keys(entry.results).length
    });
    this.runHistory.unshift(entry);
    if (this.runHistory.length > this.maxHistorySize) {
      const removed = this.runHistory.length - this.maxHistorySize;
      this.runHistory = this.runHistory.slice(0, this.maxHistorySize);
      logger.debug('🗑️  Trimmed scheduler history', { removed, maxSize: this.maxHistorySize });
    }
    logger.debug('✅ History entry added', { totalEntries: this.runHistory.length });
  }

  getHistory(): SchedulerRunHistory[] {
    return [...this.runHistory];
  }

  clearHistory(): void {
    const count = this.runHistory.length;
    logger.info('🗑️  Clearing scheduler history', { entryCount: count });
    this.runHistory = [];
    logger.debug('✅ Scheduler history cleared');
  }

  getNextRunTime(schedule: string): Date | null {
    if (!schedule) {
      return null;
    }

    try {
      const interval = CronExpressionParser.parse(schedule, {
        tz: 'UTC'
      });
      return interval.next().toDate();
    } catch (error: unknown) {
      logger.debug('Could not parse cron for next run time', { schedule, error: getErrorMessage(error) });
      return null;
    }
  }

  getStatus(config?: Config): {
    running: boolean;
    schedule: string | null;
    nextRun: string | null;
  } {
    const configToUse = config || configService.getConfig();
    const globalSchedule = this.globalCurrentSchedule || configToUse.scheduler?.schedule || null;
    const globalNextRun = globalSchedule ? this.getNextRunTime(globalSchedule) : null;

    const globalRunning = !!this.globalTask;

    return {
      running: globalRunning,
      schedule: globalSchedule,
      nextRun: globalNextRun ? globalNextRun.toISOString() : null
    };
  }
}

export const schedulerService = new SchedulerService();
