import { z } from 'zod';
import { configSchema } from '../schemas/configSchema';

export type Config = z.infer<typeof configSchema>;

