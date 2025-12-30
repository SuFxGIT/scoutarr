import { AxiosInstance } from 'axios';
import logger from './logger.js';
import { getErrorMessage } from './errorUtils.js';

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
}

/**
 * Fetches custom format scores for media files
 * Intelligently batches large requests to avoid 414 URI Too Long errors
 * Handles Sonarr's 500 errors (stale IDs) gracefully
 */
export async function fetchCustomFormatScores(
  options: FetchOptions
): Promise<Map<number, { score?: number; dateAdded?: string }>> {
  const { client, apiVersion, endpoint, paramName, fileIds, appName } = options;

  if (fileIds.length === 0) {
    return new Map();
  }

  // Use batching only for large requests (>100 files) to avoid 414 errors
  const BATCH_SIZE = 100;
  const shouldBatch = fileIds.length > BATCH_SIZE;

  if (!shouldBatch) {
    // Small request - fetch directly
    return fetchBatch(client, apiVersion, endpoint, paramName, fileIds, appName);
  }

  // Large request - batch it
  const batches: number[][] = [];
  for (let i = 0; i < fileIds.length; i += BATCH_SIZE) {
    batches.push(fileIds.slice(i, i + BATCH_SIZE));
  }

  logger.debug(`📡 [${appName}] Fetching ${endpoint} in ${batches.length} batches`, {
    totalFiles: fileIds.length
  });

  const allResults = new Map<number, { score?: number; dateAdded?: string }>();
  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    const result = await fetchBatch(client, apiVersion, endpoint, paramName, batch, appName);

    if (result.size > 0) {
      successCount++;
      result.forEach((value, key) => allResults.set(key, value));
    } else {
      failCount++;
    }
  }

  logger.debug(`✅ [${appName}] Fetched ${allResults.size}/${fileIds.length} ${endpoint} (${successCount}/${batches.length} batches succeeded)`);

  return allResults;
}

/**
 * Fetches a single batch of file scores
 */
async function fetchBatch(
  client: AxiosInstance,
  apiVersion: 'v1' | 'v3',
  endpoint: string,
  paramName: string,
  fileIds: number[],
  appName: string
): Promise<Map<number, { score?: number; dateAdded?: string }>> {
  try {
    const filesResponse = await client.get<FileWithScore[]>(
      `/api/${apiVersion}/${endpoint}`,
      {
        params: { [paramName]: fileIds },
        paramsSerializer: { indexes: null }
      }
    );

    return new Map(filesResponse.data.map(f => [f.id, {
      score: f.customFormatScore,
      dateAdded: f.dateAdded
    }]));
  } catch (error: unknown) {
    const errorMsg = getErrorMessage(error);

    // Extract detailed error info from axios error
    let statusCode: number | undefined;
    let responseData: any;

    if (error && typeof error === 'object' && 'response' in error) {
      const axiosError = error as any;
      statusCode = axiosError.response?.status;
      responseData = axiosError.response?.data;
    }

    // Log warning for 414 or 500 errors, but continue gracefully
    if (statusCode === 414) {
      logger.warn(`⚠️  [${appName}] 414 URI Too Long - batch size too large (${fileIds.length} files)`);
    } else if (statusCode === 500) {
      // Sonarr sometimes has stale episode file IDs in its database
      const message = responseData?.message || '';
      if (message.includes('Expected query to return')) {
        logger.debug(`⚠️  [${appName}] Sonarr database has stale file IDs (${fileIds.length} requested, got ${message})`);
      } else {
        logger.warn(`⚠️  [${appName}] API 500 error fetching ${endpoint}`, {
          error: errorMsg,
          fileCount: fileIds.length
        });
      }
    } else {
      logger.warn(`⚠️  [${appName}] Failed to fetch ${endpoint}`, {
        error: errorMsg,
        fileCount: fileIds.length,
        status: statusCode
      });
    }

    return new Map();
  }
}
