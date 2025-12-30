import { AxiosInstance } from 'axios';
import logger from './logger.js';
import { getErrorMessage } from './errorUtils.js';

interface FileWithScore {
  id: number;
  customFormatScore?: number;
}

interface FetchOptions {
  client: AxiosInstance;
  apiVersion: 'v1' | 'v3';
  endpoint: string;        // 'moviefile', 'episodefile', 'trackfile', 'bookfile'
  paramName: string;       // 'movieFileIds', 'episodeFileIds', etc.
  fileIds: number[];
  appName: string;
}

/**
 * Fetches custom format scores for media files in batches
 * Common pattern used across all *arr services
 * Batches requests to avoid 414 URI Too Long errors
 */
export async function fetchCustomFormatScores(
  options: FetchOptions
): Promise<Map<number, number | undefined>> {
  const { client, apiVersion, endpoint, paramName, fileIds, appName } = options;

  if (fileIds.length === 0) {
    return new Map();
  }

  try {
    logger.debug(`📡 [${appName} API] Fetching ${endpoint} for custom format scores`, {
      fileCount: fileIds.length
    });

    const batchSize = 100;
    const allFiles: FileWithScore[] = [];

    for (let i = 0; i < fileIds.length; i += batchSize) {
      const batch = fileIds.slice(i, i + batchSize);
      const filesResponse = await client.get<FileWithScore[]>(
        `/api/${apiVersion}/${endpoint}`,
        {
          params: { [paramName]: batch },
          paramsSerializer: { indexes: null }
        }
      );
      allFiles.push(...filesResponse.data);
    }

    logger.debug(`📡 [${appName} API] Fetched ${endpoint}`, { count: allFiles.length });

    return new Map(allFiles.map(f => [f.id, f.customFormatScore]));
  } catch (error: unknown) {
    logger.warn(
      `⚠️  [${appName} API] Failed to fetch ${endpoint} for custom format scores`,
      { error: getErrorMessage(error) }
    );
    return new Map();
  }
}
