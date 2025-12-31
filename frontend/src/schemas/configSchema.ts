import { z } from 'zod';
import { CronExpressionParser } from 'cron-parser';

const validateCronExpression = (cron: string) => {
  try {
    CronExpressionParser.parse(cron);
    return true;
  } catch {
    return false;
  }
};

export const radarrInstanceSchema = z.object({
  id: z.string(),
  instanceId: z.number().optional(),
  name: z.string().optional(),
  url: z.string().refine((val) => {
    if (val === '') return true;
    try {
      new URL(val);
      return true;
    } catch {
      return false;
    }
  }, {
    message: 'Invalid URL format',
  }),
  apiKey: z.string().refine((val) => val === '' || val.length >= 32, {
    message: 'API key must be at least 32 characters when provided',
  }),
  count: z.union([z.number().int().positive(), z.literal('max')]),
  tagName: z.string().min(1, 'Tag name is required'),
  ignoreTag: z.string(),
  monitored: z.boolean(),
  movieStatus: z.enum(['announced', 'in cinemas', 'released', 'any']),
  qualityProfileName: z.string(),
  enabled: z.boolean().optional(),
});

export const sonarrInstanceSchema = z.object({
  id: z.string(),
  instanceId: z.number().optional(),
  name: z.string().optional(),
  url: z.string().refine((val) => {
    if (val === '') return true;
    try {
      new URL(val);
      return true;
    } catch {
      return false;
    }
  }, {
    message: 'Invalid URL format',
  }),
  apiKey: z.string().refine((val) => val === '' || val.length >= 32, {
    message: 'API key must be at least 32 characters when provided',
  }),
  count: z.union([z.number().int().positive(), z.literal('max')]),
  tagName: z.string().min(1, 'Tag name is required'),
  ignoreTag: z.string(),
  monitored: z.boolean(),
  seriesStatus: z.enum(['continuing', 'upcoming', 'ended', '']),
  qualityProfileName: z.string(),
  enabled: z.boolean().optional(),
});

export const lidarrInstanceSchema = z.object({
  id: z.string(),
  instanceId: z.number().optional(),
  name: z.string().optional(),
  url: z.string().refine((val) => {
    if (val === '') return true;
    try {
      new URL(val);
      return true;
    } catch {
      return false;
    }
  }, {
    message: 'Invalid URL format',
  }),
  apiKey: z.string().refine((val) => val === '' || val.length >= 32, {
    message: 'API key must be at least 32 characters when provided',
  }),
  count: z.union([z.number().int().positive(), z.literal('max')]),
  tagName: z.string().min(1, 'Tag name is required'),
  ignoreTag: z.string(),
  monitored: z.boolean(),
  artistStatus: z.enum(['continuing', 'ended', '']),
  qualityProfileName: z.string(),
  enabled: z.boolean().optional(),
});

export const readarrInstanceSchema = z.object({
  id: z.string(),
  instanceId: z.number().optional(),
  name: z.string().optional(),
  url: z.string().refine((val) => {
    if (val === '') return true;
    try {
      new URL(val);
      return true;
    } catch {
      return false;
    }
  }, {
    message: 'Invalid URL format',
  }),
  apiKey: z.string().refine((val) => val === '' || val.length >= 32, {
    message: 'API key must be at least 32 characters when provided',
  }),
  count: z.union([z.number().int().positive(), z.literal('max')]),
  tagName: z.string().min(1, 'Tag name is required'),
  ignoreTag: z.string(),
  monitored: z.boolean(),
  authorStatus: z.enum(['continuing', 'ended', '']),
  qualityProfileName: z.string(),
  enabled: z.boolean().optional(),
});

export const notificationConfigSchema = z.object({
  discordWebhook: z.string().url('Invalid Discord webhook URL').or(z.literal('')),
  notifiarrPassthroughWebhook: z.string().url('Invalid webhook URL').or(z.literal('')),
  notifiarrPassthroughDiscordChannelId: z.string().default(''),
  pushoverUserKey: z.string().default(''),
  pushoverApiToken: z.string().default(''),
});

export const schedulerConfigSchema = z.object({
  enabled: z.boolean(),
  schedule: z.string().refine(validateCronExpression, 'Invalid cron expression'),
  unattended: z.boolean(),
});

export const tasksConfigSchema = z.object({
  syncSchedule: z.string().refine(validateCronExpression, 'Invalid cron expression'),
  syncEnabled: z.boolean(),
});

export const configSchema = z.object({
  notifications: notificationConfigSchema,
  applications: z.object({
    radarr: z.array(radarrInstanceSchema),
    sonarr: z.array(sonarrInstanceSchema),
    lidarr: z.array(lidarrInstanceSchema),
    readarr: z.array(readarrInstanceSchema),
  }),
  scheduler: schedulerConfigSchema,
  tasks: tasksConfigSchema,
});

