import cron from 'node-cron';
import { createRequire } from 'module';
import { configService } from './configService.js';
import { notificationService } from './notificationService.js';
import logger from '../utils/logger.js';
import { executeSearchRun, executeSearchRunForInstance } from '../routes/search.js';
import { getConfiguredInstances, APP_TYPES, AppType } from '../utils/starrUtils.js';

// cron-parser is a CommonJS module, use createRequire to import it
const require = createRequire(import.meta.url);
const { parseExpression } = require('cron-parser');

interface SchedulerRunHistory {
  timestamp: string;
  results: Record<string, any>;
  success: boolean;
  error?: string;
  instanceKey?: string;
}

interface InstanceSchedulerTask {
  task: cron.ScheduledTask;
  schedule: string;
  isRunning: boolean;
}

class SchedulerService {
  private globalTask: cron.ScheduledTask | null = null;
  private globalIsRunning = false;
  private globalCurrentSchedule: string | null = null;

  private instanceTasks: Map<string, InstanceSchedulerTask> = new Map();
  private instanceIsRunning: Map<string, boolean> = new Map();

  private runHistory: SchedulerRunHistory[] = [];
  private maxHistorySize = 100;

  async initialize(): Promise<void> {
    const config = configService.getConfig();
    
    if (config.scheduler?.enabled && config.scheduler?.schedule) {
      this.startGlobal(config.scheduler.schedule);
      logger.info('✅ Global scheduler initialized', { schedule: config.scheduler.schedule });
    } else {
      logger.info('ℹ️  Global scheduler disabled');
    }

    this.initializeInstanceSchedulers();
  }

  private initializeInstanceSchedulers(): void {
    const config = configService.getConfig();
    
    this.stopAllInstanceSchedulers();

    for (const appType of APP_TYPES) {
      const instances = getConfiguredInstances(config.applications[appType] as any[]);
      for (const instance of instances) {
        if (instance.scheduleEnabled && instance.schedule) {
          const instanceKey = `${appType}-${instance.id}`;
          this.startInstance(instanceKey, appType, instance.id, instance.schedule);
        }
      }
    }

    const instanceCount = this.instanceTasks.size;
    if (instanceCount > 0) {
      logger.info(`✅ Per-instance schedulers initialized: ${instanceCount} instance(s)`);
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
      schedule,
      isRunning: false
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
    const config = configService.getConfig();
    
    if (config.scheduler?.enabled && config.scheduler?.schedule) {
      this.startGlobal(config.scheduler.schedule);
    } else {
      this.stopGlobal();
    }

    this.initializeInstanceSchedulers();
  }

  private async runGlobalScheduledSearch(schedule: string): Promise<void> {
    if (this.globalIsRunning) {
      logger.warn('⏸️  Previous global search still running, skipping scheduled run');
      return;
    }

    this.globalIsRunning = true;
    logger.info('⏰ Global scheduled search triggered', { schedule });

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

      try {
        await notificationService.sendNotifications(results, true);
      } catch (notificationError: any) {
        logger.debug('Failed to send notifications', {
          error: notificationError.message
        });
      }
    } catch (error: any) {
      const historyEntry: SchedulerRunHistory = {
        timestamp: new Date().toISOString(),
        results: {},
        success: false,
        error: error.message
      };
      this.addToHistory(historyEntry);

      logger.error('❌ Global scheduled search failed', {
        error: error.message,
        stack: error.stack
      });

      try {
        await notificationService.sendNotifications({}, false, error.message);
      } catch (notificationError: any) {
        logger.debug('Failed to send failure notifications', {
          error: notificationError.message
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
    logger.info('⏰ Instance scheduled search triggered', { instanceKey, schedule });

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

      try {
        await notificationService.sendNotifications(results, true);
      } catch (notificationError: any) {
        logger.debug('Failed to send notifications', {
          error: notificationError.message
        });
      }
    } catch (error: any) {
      const historyEntry: SchedulerRunHistory = {
        timestamp: new Date().toISOString(),
        results: {},
        success: false,
        error: error.message,
        instanceKey
      };
      this.addToHistory(historyEntry);

      logger.error('❌ Instance scheduled search failed', {
        instanceKey,
        error: error.message,
        stack: error.stack
      });

      try {
        await notificationService.sendNotifications({}, false, error.message);
      } catch (notificationError: any) {
        logger.debug('Failed to send failure notifications', {
          error: notificationError.message
        });
      }
    } finally {
      this.instanceIsRunning.set(instanceKey, false);
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

  getStatus(): { 
    running: boolean; 
    schedule: string | null; 
    nextRun: string | null;
    instances: Record<string, { schedule: string; nextRun: string | null; running: boolean }>;
  } {
    const config = configService.getConfig();
    const globalSchedule = this.globalCurrentSchedule || config.scheduler?.schedule || null;
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