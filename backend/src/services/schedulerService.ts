import cron from 'node-cron';
import { createRequire } from 'module';
import { configService } from './configService.js';
import { notificationService } from './notificationService.js';
import logger from '../utils/logger.js';
import { executeSearchRun, executeSearchRunForInstance } from '../routes/search.js';
import { getConfiguredInstances, APP_TYPES, AppType } from '../utils/starrUtils.js';
import { StarrInstanceConfig, SearchResults, Config } from '@scoutarr/shared';
import { getErrorMessage } from '../utils/errorUtils.js';

// cron-parser is a CommonJS module, use createRequire to import it
const require = createRequire(import.meta.url);
const { parseExpression } = require('cron-parser');

interface SchedulerRunHistory {
  timestamp: string;
  results: SearchResults;
  success: boolean;
  error?: string;
  instanceKey?: string;
}

interface InstanceSchedulerTask {
  task: cron.ScheduledTask;
  schedule: string;
}

class SchedulerService {
  private globalTask: cron.ScheduledTask | null = null;
  private globalIsRunning = false;
  private globalCurrentSchedule: string | null = null;

  private instanceTasks: Map<string, InstanceSchedulerTask> = new Map();
  private instanceIsRunning: Map<string, boolean> = new Map();

  private runHistory: SchedulerRunHistory[] = [];
  private maxHistorySize = 100;

  /**
   * Helper to send notifications with error logging
   */
  private async sendNotificationsWithLogging(results: SearchResults, success: boolean, error?: string): Promise<void> {
    try {
      await notificationService.sendNotifications(results, success, error);
    } catch (notificationError: unknown) {
      logger.debug('Failed to send notifications', { error: getErrorMessage(notificationError) });
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

    logger.debug('🕐 Initializing per-instance schedulers');
    this.initializeInstanceSchedulers();
    logger.debug('✅ Scheduler service initialization complete');
  }

  private initializeInstanceSchedulers(): void {
    logger.debug('🕐 Initializing per-instance schedulers');
    const config = configService.getConfig();
    
    logger.debug('🔄 Stopping all existing instance schedulers');
    this.stopAllInstanceSchedulers();

    let totalFound = 0;
    let totalStarted = 0;
    
    for (const appType of APP_TYPES) {
      const instances = getConfiguredInstances(config.applications[appType] as StarrInstanceConfig[]);
      logger.debug(`📋 Checking ${appType} instances for scheduling`, { instanceCount: instances.length });
      
      for (const instance of instances) {
        totalFound++;
        if (instance.scheduleEnabled && instance.schedule) {
          const instanceKey = `${appType}-${instance.id}`;
          logger.debug(`🕐 Starting scheduler for instance`, { instanceKey, schedule: instance.schedule });
          this.startInstance(instanceKey, appType, instance.id, instance.schedule);
          totalStarted++;
        } else {
          logger.debug(`⏸️  Instance scheduler disabled or no schedule`, { 
            instanceId: instance.id,
            scheduleEnabled: instance.scheduleEnabled || false,
            hasSchedule: !!instance.schedule
          });
        }
      }
    }

    const instanceCount = this.instanceTasks.size;
    if (instanceCount > 0) {
      logger.info(`✅ Per-instance schedulers initialized: ${instanceCount} instance(s)`, { 
        totalFound,
        totalStarted,
        totalSkipped: totalFound - totalStarted
      });
    } else {
      logger.debug('ℹ️  No per-instance schedulers configured', { totalFound });
    }
  }

  startGlobal(schedule: string): void {
    this.stopGlobal();

    if (!cron.validate(schedule)) {
      logger.error('❌ Invalid cron schedule', { schedule });
      return;
    }

    this.globalCurrentSchedule = schedule;

    this.globalTask = cron.schedule(
      schedule,
      async () => {
        await this.runGlobalScheduledSearch(schedule);
      },
      {
        scheduled: true,
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

  startInstance(instanceKey: string, appType: AppType, instanceId: string, schedule: string): void {
    this.stopInstance(instanceKey);

    if (!cron.validate(schedule)) {
      logger.error('❌ Invalid cron schedule for instance', { instanceKey, schedule });
      return;
    }

    const task = cron.schedule(
      schedule,
      async () => {
        await this.runInstanceScheduledSearch(instanceKey, appType, instanceId, schedule);
      },
      {
        scheduled: true,
        timezone: 'UTC'
      }
    );

    const taskInfo: InstanceSchedulerTask = {
      task,
      schedule
    };

    this.instanceTasks.set(instanceKey, taskInfo);
    logger.info('🕐 Instance scheduler started', { instanceKey, schedule });
  }

  stopInstance(instanceKey: string): void {
    const taskInfo = this.instanceTasks.get(instanceKey);
    if (!taskInfo) return;

    taskInfo.task.stop();
    this.instanceTasks.delete(instanceKey);
    this.instanceIsRunning.delete(instanceKey);
  }

  stopAllInstanceSchedulers(): void {
    for (const instanceKey of this.instanceTasks.keys()) {
      this.stopInstance(instanceKey);
    }
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

    logger.debug('🔄 Restarting per-instance schedulers');
    this.initializeInstanceSchedulers();
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

      await this.sendNotificationsWithLogging(results, true);
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

      logger.error('❌ Global scheduled search failed', {
        error: errorMessage,
        stack: errorStack
      });

      try {
        await notificationService.sendNotifications({}, false, errorMessage);
      } catch (notificationError: unknown) {
        const errorMessage = notificationError instanceof Error ? notificationError.message : 'Unknown error';
        logger.debug('Failed to send failure notifications', {
          error: errorMessage
        });
      }
    } finally {
      this.globalIsRunning = false;
    }
  }

  private async runInstanceScheduledSearch(instanceKey: string, appType: AppType, instanceId: string, schedule: string): Promise<void> {
    const isRunning = this.instanceIsRunning.get(instanceKey);
    if (isRunning) {
      logger.warn('⏸️  Previous instance search still running, skipping scheduled run', { instanceKey });
      return;
    }

    this.instanceIsRunning.set(instanceKey, true);
    logger.info('⏰ Instance scheduled search started', { instanceKey, schedule });

    try {
      const results = await executeSearchRunForInstance(appType, instanceId);
      const historyEntry: SchedulerRunHistory = {
        timestamp: new Date().toISOString(),
        results,
        success: true,
        instanceKey
      };
      this.addToHistory(historyEntry);

      logger.info('✅ Instance scheduled search completed', {
        instanceKey,
        results: Object.keys(results).map(app => ({
          app,
          success: results[app].success,
          count: results[app].searched || 0
        }))
      });

      await this.sendNotificationsWithLogging(results, true);
    } catch (error: unknown) {
      const errorMessage = getErrorMessage(error);
      const errorStack = error instanceof Error ? error.stack : undefined;
      const historyEntry: SchedulerRunHistory = {
        timestamp: new Date().toISOString(),
        results: {},
        success: false,
        error: errorMessage,
        instanceKey
      };
      this.addToHistory(historyEntry);

      logger.error('❌ Instance scheduled search failed', {
        instanceKey,
        error: errorMessage,
        stack: errorStack
      });

      try {
        await notificationService.sendNotifications({}, false, errorMessage);
      } catch (notificationError: unknown) {
        const errorMessage = notificationError instanceof Error ? notificationError.message : 'Unknown error';
        logger.debug('Failed to send failure notifications', {
          error: errorMessage
        });
      }
    } finally {
      this.instanceIsRunning.set(instanceKey, false);
    }
  }

  addToHistory(entry: SchedulerRunHistory): void {
    logger.debug('📝 Adding entry to scheduler history', { 
      success: entry.success,
      instanceKey: entry.instanceKey || 'global',
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
      const interval = parseExpression(schedule, {
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
    instances: Record<string, { schedule: string; nextRun: string | null; running: boolean }>;
  } {
    const configToUse = config || configService.getConfig();
    const globalSchedule = this.globalCurrentSchedule || configToUse.scheduler?.schedule || null;
    const globalNextRun = globalSchedule ? this.getNextRunTime(globalSchedule) : null;
    
    const instances: Record<string, { schedule: string; nextRun: string | null; running: boolean }> = {};
    let anyInstanceRunning = false;
    for (const [instanceKey, taskInfo] of this.instanceTasks.entries()) {
      const isRunning = this.instanceIsRunning.get(instanceKey) || false;
      instances[instanceKey] = {
        schedule: taskInfo.schedule,
        nextRun: this.getNextRunTime(taskInfo.schedule)?.toISOString() || null,
        running: isRunning
      };
      if (isRunning) {
        anyInstanceRunning = true;
      }
    }
    
    const globalRunning = !!this.globalTask;
    
    return {
      running: globalRunning || anyInstanceRunning,
      schedule: globalSchedule,
      nextRun: globalNextRun ? globalNextRun.toISOString() : null,
      instances
    };
  }
}

export const schedulerService = new SchedulerService();
