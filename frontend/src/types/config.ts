import { z } from 'zod';
import { configSchema, radarrInstanceSchema, sonarrInstanceSchema, lidarrInstanceSchema, readarrInstanceSchema } from '../schemas/configSchema';

export type Config = z.infer<typeof configSchema>;
export type RadarrInstance = z.infer<typeof radarrInstanceSchema>;
export type SonarrInstance = z.infer<typeof sonarrInstanceSchema>;
export type LidarrInstance = z.infer<typeof lidarrInstanceSchema>;
export type ReadarrInstance = z.infer<typeof readarrInstanceSchema>;

