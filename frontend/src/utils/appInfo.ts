import type { AppType } from './constants';
import type { RadarrInstance, SonarrInstance, LidarrInstance, ReadarrInstance } from '../types/config';

export type StarrInstanceConfig = RadarrInstance | SonarrInstance | LidarrInstance | ReadarrInstance;

const DEFAULT_TAG = 'upgradinatorr';

type BaseInstanceConfig = {
  id: string;
  instanceId: number;
  name: string;
  url: string;
  apiKey: string;
  count: number;
  tagName: string;
  ignoreTag: string;
  monitored: boolean;
  qualityProfileName: string;
  enabled: boolean;
};

export const APP_INFO: Record<AppType, { name: string; mediaType: string; mediaTypePlural: string; defaultPort: string }> = {
  radarr: { name: 'Radarr', mediaType: 'Movies', mediaTypePlural: 'movies', defaultPort: '7878' },
  sonarr: { name: 'Sonarr', mediaType: 'Series', mediaTypePlural: 'series', defaultPort: '8989' },
  lidarr: { name: 'Lidarr', mediaType: 'Artists', mediaTypePlural: 'artists', defaultPort: '8686' },
  readarr: { name: 'Readarr', mediaType: 'Authors', mediaTypePlural: 'authors', defaultPort: '8787' },
};

export const getAppInfo = (appType: AppType) => APP_INFO[appType];

export const getNextInstanceId = (instances: StarrInstanceConfig[]): number => {
  const existingIds = instances
    .map(inst => inst.instanceId)
    .filter((id): id is number => typeof id === 'number')
    .sort((a, b) => a - b);

  for (let i = 1; i <= existingIds.length + 1; i++) {
    if (!existingIds.includes(i)) {
      return i;
    }
  }
  return existingIds.length + 1;
};

export const buildDefaultInstance = (app: AppType, instanceId: number): StarrInstanceConfig => {
  const baseConfig: BaseInstanceConfig = {
    id: `${app}-${instanceId}`,
    instanceId,
    name: '',
    url: '',
    apiKey: '',
    count: 5,
    tagName: DEFAULT_TAG,
    ignoreTag: '',
    monitored: true,
    qualityProfileName: '',
    enabled: true,
  };

  switch (app) {
    case 'radarr':
      return { ...baseConfig, movieStatus: 'any' } as RadarrInstance;
    case 'sonarr':
      return { ...baseConfig, seriesStatus: '', hideSpecials: false } as SonarrInstance;
    case 'lidarr':
      return { ...baseConfig, artistStatus: '' } as LidarrInstance;
    case 'readarr':
    default:
      return { ...baseConfig, authorStatus: '' } as ReadarrInstance;
  }
};
