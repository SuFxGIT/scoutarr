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
    logger.debug(`⏭️  [${appName}] No file IDs provided, skipping custom format score fetch`);
    return new Map();
  }

  logger.info(`📡 [${appName} API] Starting custom format score fetch`, {
    endpoint,
    totalFiles: fileIds.length,
    apiVersion
  });

  try {
    const batchSize = 100;
    const batchCount = Math.ceil(fileIds.length / batchSize);
    logger.debug(`📦 [${appName} API] Processing in ${batchCount} batches`, { 
      batchSize,
      batchCount,
      totalFiles: fileIds.length
    });

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
      
      const batchFiles = filesResponse.data;
      allFiles.push(...batchFiles);
    }

    const scoreMap = new Map(allFiles.map(f => [f.id, f.customFormatScore]));
    const filesWithScores = allFiles.filter(f => f.customFormatScore !== undefined).length;

    logger.info(`✅ [${appName} API] Custom format score fetch completed`, { 
      totalFilesFetched: allFiles.length,
      filesWithScores,
      filesWithoutScores: allFiles.length - filesWithScores,
      endpoint
    });

    return scoreMap;
  } catch (error: unknown) {
    const errorMessage = getErrorMessage(error);
    const errorStack = error instanceof Error ? error.stack : undefined;
    logger.error(
      `❌ [${appName} API] Failed to fetch ${endpoint} for custom format scores`,
      { 
        error: errorMessage,
        stack: errorStack,
        endpoint,
        fileCount: fileIds.length
      }
    );
    return new Map();
  }
}
