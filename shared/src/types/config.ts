/**
 * Shared configuration types for Scoutarr
 * Derived from the Zod schemas to keep runtime validation and static types aligned.
 */
import { z } from 'zod';
import {
  radarrInstanceSchema,
  sonarrInstanceSchema,
  lidarrInstanceSchema,
  readarrInstanceSchema,
  notificationConfigSchema,
  schedulerConfigSchema,
  tasksConfigSchema,
  configSchema,
} from '../schemas/config.js';

export type NotificationConfig = z.infer<typeof notificationConfigSchema>;

export type RadarrInstance = z.infer<typeof radarrInstanceSchema>;
export type SonarrInstance = z.infer<typeof sonarrInstanceSchema>;
export type LidarrInstance = z.infer<typeof lidarrInstanceSchema>;
export type ReadarrInstance = z.infer<typeof readarrInstanceSchema>;

export interface ApplicationsConfig {
  radarr: RadarrInstance[];
  sonarr: SonarrInstance[];
  lidarr: LidarrInstance[];
  readarr: ReadarrInstance[];
}

export type SchedulerConfig = z.infer<typeof schedulerConfigSchema>;
export type TasksConfig = z.infer<typeof tasksConfigSchema>;

export type Config = z.infer<typeof configSchema>;
