import { AxiosInstance } from 'axios';
import logger from './logger.js';
import { getErrorMessage } from './errorUtils.js';
import { getRateLimiter } from './rateLimiter.js';

interface FileWithScore {
  id: number;
  customFormatScore?: number;
  dateAdded?: string;
}

interface FetchOptions {
  client: AxiosInstance;
  apiVersion: 'v1' | 'v3';
  endpoint: string;        // 'moviefile', 'episodefile', 'trackfile', 'bookfile'
  paramName: string;       // 'movieFileIds', 'episodeFileIds', etc.
  fileIds: number[];
  appName: string;
  instanceId?: string;     // Optional instance ID for rate limiting
}

/**
 * Fetches custom format scores for media files in batches
 * Common pattern used across all *arr services
 * Batches requests to avoid 414 URI Too Long errors
 */
export async function fetchCustomFormatScores(
  options: FetchOptions
): Promise<Map<number, { score?: number; dateAdded?: string }>> {
  const { client, apiVersion, endpoint, paramName, fileIds, appName, instanceId } = options;

  if (fileIds.length === 0) {
    return new Map();
  }

  // Get rate limiter for this instance (60 requests per minute)
  const rateLimiter = instanceId ? getRateLimiter(instanceId, 60, 60000) : null;

  try {
    logger.debug(`📡 [${appName} API] Fetching ${endpoint} for custom format scores`, {
      fileCount: fileIds.length,
      rateLimitEnabled: !!rateLimiter
    });

    const batchSize = 25;
    const allFiles: FileWithScore[] = [];

    for (let i = 0; i < fileIds.length; i += batchSize) {
      const batch = fileIds.slice(i, i + batchSize);
      const batchNumber = Math.floor(i / batchSize) + 1;
      const totalBatches = Math.ceil(fileIds.length / batchSize);

      logger.debug(`📡 [${appName} API] Fetching batch ${batchNumber} of ${totalBatches}`, {
        batchSize: batch.length,
        firstId: batch[0],
        lastId: batch[batch.length - 1]
      });

      try {
        // Wait for rate limiter before making request
        if (rateLimiter) {
          await rateLimiter.acquire();
        }

        const filesResponse = await client.get<FileWithScore[]>(
          `/api/${apiVersion}/${endpoint}`,
          {
            params: { [paramName]: batch },
            paramsSerializer: { indexes: null }
          }
        );
        allFiles.push(...filesResponse.data);

        logger.debug(`📡 [${appName} API] Batch ${batchNumber} fetched`, {
          count: filesResponse.data.length
        });
      } catch (batchError: unknown) {
        const errorMsg = getErrorMessage(batchError);
        const errorDetails = batchError instanceof Error && 'response' in batchError
          ? { status: (batchError as any).response?.status, data: (batchError as any).response?.data }
          : {};

        logger.warn(
          `⚠️  [${appName} API] Failed to fetch batch ${batchNumber} of ${totalBatches}`,
          {
            error: errorMsg,
            batchSize: batch.length,
            firstId: batch[0],
            lastId: batch[batch.length - 1],
            ...errorDetails
          }
        );

        // Continue with remaining batches instead of failing completely
        // This way we get partial data instead of nothing
      }
    }

    logger.debug(`📡 [${appName} API] Fetched ${endpoint}`, { count: allFiles.length });

    return new Map(allFiles.map(f => [f.id, {
      score: f.customFormatScore,
      dateAdded: f.dateAdded
    }]));
  } catch (error: unknown) {
    const errorMsg = getErrorMessage(error);
    const errorDetails = error instanceof Error && 'response' in error
      ? { status: (error as any).response?.status, data: (error as any).response?.data }
      : {};

    logger.warn(
      `⚠️  [${appName} API] Failed to fetch ${endpoint} for custom format scores`,
      {
        error: errorMsg,
        fileCount: fileIds.length,
        ...errorDetails
      }
    );
    return new Map();
  }
}
