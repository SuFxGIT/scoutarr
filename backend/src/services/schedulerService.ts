import cron from 'node-cron';
import { createRequire } from 'module';
import { configService } from './configService.js';
import logger from '../utils/logger.js';
import { executeSearchRun, executeSearchRunForInstance } from '../routes/search.js';
import { getConfiguredInstances } from '../utils/starrUtils.js';

// cron-parser is a CommonJS module, use createRequire to import it
const require = createRequire(import.meta.url);
const { parseExpression } = require('cron-parser');

interface SchedulerRunHistory {
  timestamp: string;
  results: Record<string, any>;
  success: boolean;
  error?: string;
  instanceKey?: string; // For per-instance scheduling: "radarr-instanceId" or "sonarr-instanceId"
}

interface InstanceSchedulerTask {
  task: cron.ScheduledTask | null;
  timeoutTimer: NodeJS.Timeout | null;
  intervalTimer: NodeJS.Timeout | null;
  nextRunTime: Date | null;
  usingInterval: boolean;
  intervalMs: number | null;
  schedule: string;
  isRunning: boolean;
}

class SchedulerService {
  // Global scheduler (backward compatibility)
  private globalTask: cron.ScheduledTask | null = null;
  private globalIsRunning = false;
  private globalTimeoutTimer: NodeJS.Timeout | null = null;
  private globalIntervalTimer: NodeJS.Timeout | null = null;
  private globalNextRunTime: Date | null = null;
  private globalCurrentSchedule: string | null = null;
  private globalUsingInterval = false;
  private globalIntervalMs: number | null = null;

  // Per-instance schedulers
  private instanceTasks: Map<string, InstanceSchedulerTask> = new Map();
  private instanceIsRunning: Map<string, boolean> = new Map();

  private runHistory: SchedulerRunHistory[] = [];
  private maxHistorySize = 100;

  async initialize(): Promise<void> {
    const config = configService.getConfig();
    
    // Initialize global scheduler if enabled (backward compatibility)
    if (config.scheduler?.enabled && config.scheduler?.schedule) {
      this.startGlobal(config.scheduler.schedule);
      logger.info('✅ Global scheduler initialized', { schedule: config.scheduler.schedule });
    } else {
      logger.info('ℹ️  Global scheduler disabled');
    }

    // Initialize per-instance schedulers
    this.initializeInstanceSchedulers();
  }

  private initializeInstanceSchedulers(): void {
    const config = configService.getConfig();
    
    // Clear existing instance schedulers
    this.stopAllInstanceSchedulers();

    // Process Radarr instances
    const radarrInstances = getConfiguredInstances(config.applications.radarr);
    for (const instance of radarrInstances) {
      if (instance.scheduleEnabled && instance.schedule) {
        const instanceKey = `radarr-${instance.id}`;
        this.startInstance(instanceKey, 'radarr', instance.id, instance.schedule);
      }
    }

    // Process Sonarr instances
    const sonarrInstances = getConfiguredInstances(config.applications.sonarr);
    for (const instance of sonarrInstances) {
      if (instance.scheduleEnabled && instance.schedule) {
        const instanceKey = `sonarr-${instance.id}`;
        this.startInstance(instanceKey, 'sonarr', instance.id, instance.schedule);
      }
    }

    const instanceCount = this.instanceTasks.size;
    if (instanceCount > 0) {
      logger.info(`✅ Per-instance schedulers initialized: ${instanceCount} instance(s)`);
    }
  }

  // Global scheduler methods (backward compatibility)
  startGlobal(schedule: string): void {
    this.stopGlobal();

    if (!cron.validate(schedule)) {
      logger.error('❌ Invalid cron schedule', { schedule });
      return;
    }

    this.globalCurrentSchedule = schedule;
    const intervalMs = this.getIntervalMsForSchedule(schedule);

    if (intervalMs !== null) {
      this.globalUsingInterval = true;
      this.globalIntervalMs = intervalMs;
      this.globalNextRunTime = new Date(Date.now() + intervalMs);

      this.globalTimeoutTimer = setTimeout(async () => {
        await this.runGlobalScheduledSearch(schedule);
        this.globalIntervalTimer = setInterval(async () => {
          await this.runGlobalScheduledSearch(schedule);
          this.globalNextRunTime = new Date(Date.now() + intervalMs);
        }, intervalMs);
        this.globalNextRunTime = new Date(Date.now() + intervalMs);
      }, intervalMs);

      logger.info('🕐 Global interval scheduler started', { schedule, intervalMs });
      return;
    }

    this.globalUsingInterval = false;
    this.globalIntervalMs = null;
    this.globalNextRunTime = this.getNextRunTime(schedule);

    this.globalTask = cron.schedule(
      schedule,
      async () => {
        await this.runGlobalScheduledSearch(schedule);
        this.globalNextRunTime = this.getNextRunTime(schedule);
      },
      {
        scheduled: true,
        timezone: 'UTC'
      }
    );

    logger.info('🕐 Global cron scheduler started', { schedule });
  }

  stopGlobal(): void {
    if (this.globalTask) {
      this.globalTask.stop();
      this.globalTask = null;
    }
    if (this.globalTimeoutTimer) {
      clearTimeout(this.globalTimeoutTimer);
      this.globalTimeoutTimer = null;
    }
    if (this.globalIntervalTimer) {
      clearInterval(this.globalIntervalTimer);
      this.globalIntervalTimer = null;
    }
    this.globalUsingInterval = false;
    this.globalIntervalMs = null;
    this.globalNextRunTime = null;
    this.globalCurrentSchedule = null;
  }

  // Per-instance scheduler methods
  startInstance(instanceKey: string, appType: 'radarr' | 'sonarr', instanceId: string, schedule: string): void {
    this.stopInstance(instanceKey);

    if (!cron.validate(schedule)) {
      logger.error('❌ Invalid cron schedule for instance', { instanceKey, schedule });
      return;
    }

    const intervalMs = this.getIntervalMsForSchedule(schedule);
    const taskInfo: InstanceSchedulerTask = {
      task: null,
      timeoutTimer: null,
      intervalTimer: null,
      nextRunTime: null,
      usingInterval: false,
      intervalMs: null,
      schedule,
      isRunning: false
    };

    if (intervalMs !== null) {
      taskInfo.usingInterval = true;
      taskInfo.intervalMs = intervalMs;
      taskInfo.nextRunTime = new Date(Date.now() + intervalMs);

      taskInfo.timeoutTimer = setTimeout(async () => {
        await this.runInstanceScheduledSearch(instanceKey, appType, instanceId, schedule);
        taskInfo.intervalTimer = setInterval(async () => {
          await this.runInstanceScheduledSearch(instanceKey, appType, instanceId, schedule);
          if (taskInfo.intervalMs) {
            taskInfo.nextRunTime = new Date(Date.now() + taskInfo.intervalMs);
          }
        }, intervalMs);
        if (taskInfo.intervalMs) {
          taskInfo.nextRunTime = new Date(Date.now() + taskInfo.intervalMs);
        }
      }, intervalMs);

      logger.info('🕐 Instance interval scheduler started', { instanceKey, schedule, intervalMs });
    } else {
      taskInfo.usingInterval = false;
      taskInfo.intervalMs = null;
      taskInfo.nextRunTime = this.getNextRunTime(schedule);

      taskInfo.task = cron.schedule(
        schedule,
        async () => {
          await this.runInstanceScheduledSearch(instanceKey, appType, instanceId, schedule);
          taskInfo.nextRunTime = this.getNextRunTime(schedule);
        },
        {
          scheduled: true,
          timezone: 'UTC'
        }
      );

      logger.info('🕐 Instance cron scheduler started', { instanceKey, schedule });
    }

    this.instanceTasks.set(instanceKey, taskInfo);
  }

  stopInstance(instanceKey: string): void {
    const taskInfo = this.instanceTasks.get(instanceKey);
    if (!taskInfo) return;

    if (taskInfo.task) {
      taskInfo.task.stop();
    }
    if (taskInfo.timeoutTimer) {
      clearTimeout(taskInfo.timeoutTimer);
    }
    if (taskInfo.intervalTimer) {
      clearInterval(taskInfo.intervalTimer);
    }

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
    
    // Restart global scheduler
    if (config.scheduler?.enabled && config.scheduler?.schedule) {
      this.startGlobal(config.scheduler.schedule);
    } else {
      this.stopGlobal();
    }

    // Restart per-instance schedulers
    this.initializeInstanceSchedulers();
  }

  // Run methods
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
    } finally {
      this.globalIsRunning = false;
      if (this.globalUsingInterval && this.globalIntervalMs) {
        this.globalNextRunTime = new Date(Date.now() + this.globalIntervalMs);
      }
    }
  }

  private async runInstanceScheduledSearch(instanceKey: string, appType: 'radarr' | 'sonarr', instanceId: string, schedule: string): Promise<void> {
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
    } finally {
      this.instanceIsRunning.set(instanceKey, false);
      const taskInfo = this.instanceTasks.get(instanceKey);
      if (taskInfo && taskInfo.usingInterval && taskInfo.intervalMs) {
        taskInfo.nextRunTime = new Date(Date.now() + taskInfo.intervalMs);
      }
    }
  }

  // History methods
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

  // Utility methods
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
    
    // Collect instance statuses
    const instances: Record<string, { schedule: string; nextRun: string | null; running: boolean }> = {};
    for (const [instanceKey, taskInfo] of this.instanceTasks.entries()) {
      instances[instanceKey] = {
        schedule: taskInfo.schedule,
        nextRun: taskInfo.nextRunTime ? taskInfo.nextRunTime.toISOString() : null,
        running: this.instanceIsRunning.get(instanceKey) || false
      };
    }
    
    return {
      running: !!(this.globalTask || this.globalTimeoutTimer || this.globalIntervalTimer),
      schedule: globalSchedule,
      nextRun: globalNextRun ? globalNextRun.toISOString() : null,
      instances
    };
  }

  getInstanceNextRunTime(instanceKey: string): Date | null {
    const taskInfo = this.instanceTasks.get(instanceKey);
    if (!taskInfo) return null;
    
    if (taskInfo.usingInterval && taskInfo.nextRunTime) {
      return taskInfo.nextRunTime;
    }
    
    return this.getNextRunTime(taskInfo.schedule);
  }

  /**
   * Map known "every N" cron presets to a fixed interval in milliseconds.
   */
  private getIntervalMsForSchedule(schedule: string): number | null {
    switch (schedule) {
      case '*/1 * * * *':
        return 60 * 1000;
      case '*/10 * * * *':
        return 10 * 60 * 1000;
      case '*/30 * * * *':
        return 30 * 60 * 1000;
      case '0 * * * *':
        return 60 * 60 * 1000;
      case '0 */6 * * *':
        return 6 * 60 * 60 * 1000;
      case '0 */12 * * *':
        return 12 * 60 * 60 * 1000;
      default:
        return null;
    }
  }
}

export const schedulerService = new SchedulerService();