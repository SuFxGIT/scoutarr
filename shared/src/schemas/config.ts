import { z } from 'zod';

// Reusable URL validation
const urlValidation = z.string().refine((val) => {
  if (val === '') return true;
  try {
    new URL(val);
    return true;
  } catch {
    return false;
  }
}, {
  message: 'Invalid URL format',
});

// Reusable API key validation
const apiKeyValidation = z.string().refine(
  (val) => val === '' || val.length >= 32,
  { message: 'API key must be at least 32 characters when provided' }
);

// Factory function to create instance schemas with app-specific status field
function createInstanceSchema<T extends string>(
  statusField: 'movieStatus' | 'seriesStatus' | 'artistStatus' | 'authorStatus',
  statusEnum: readonly [T, ...T[]]
) {
  return z.object({
    id: z.string(),
    instanceId: z.number().optional(),
    name: z.string().optional(),
    url: urlValidation,
    apiKey: apiKeyValidation,
    count: z.union([z.number().int().positive(), z.literal('max')]),
    tagName: z.string().min(1, 'Tag name is required'),
    ignoreTag: z.string(),
    monitored: z.boolean(),
    [statusField]: z.enum(statusEnum),
    qualityProfileName: z.string(),
    enabled: z.boolean().optional(),
  });
}

// Create app-specific schemas using factory
export const radarrInstanceSchema = createInstanceSchema(
  'movieStatus',
  ['announced', 'in cinemas', 'released', 'any'] as const
);

export const sonarrInstanceSchema = createInstanceSchema(
  'seriesStatus',
  ['continuing', 'upcoming', 'ended', ''] as const
);

export const lidarrInstanceSchema = createInstanceSchema(
  'artistStatus',
  ['continuing', 'ended', ''] as const
);

export const readarrInstanceSchema = createInstanceSchema(
  'authorStatus',
  ['continuing', 'ended', ''] as const
);

export const notificationConfigSchema = z.object({
  discordWebhook: z.string().url('Invalid Discord webhook URL').or(z.literal('')),
  discordEnabled: z.boolean().optional(),
  ntfyServer: z.string().or(z.literal('')),
  ntfyTopic: z.string().or(z.literal('')),
  ntfyEnabled: z.boolean().optional(),
});

export const schedulerConfigSchema = z.object({
  radarr: z.string(),
  sonarr: z.string(),
  lidarr: z.string(),
  readarr: z.string(),
  unattended: z.boolean(),
});

export const tasksConfigSchema = z.object({
  syncSchedule: z.string().min(1, 'Sync schedule is required'),
  syncEnabled: z.boolean(),
});

export const configSchema = z.object({
  applications: z.object({
    radarr: z.array(radarrInstanceSchema),
    sonarr: z.array(sonarrInstanceSchema),
    lidarr: z.array(lidarrInstanceSchema),
    readarr: z.array(readarrInstanceSchema),
  }),
  notifications: notificationConfigSchema,
  scheduler: schedulerConfigSchema,
  tasks: tasksConfigSchema,
});
