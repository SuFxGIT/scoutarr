import apiClient from './apiClient';
import type { MediaLibraryResponse, MediaSearchResponse, CfScoreHistoryResponse } from '@scoutarr/shared';

export async function fetchMediaLibrary(
  appType: string,
  instanceId: string
): Promise<MediaLibraryResponse> {
  const response = await apiClient.get<MediaLibraryResponse>(
    `/media-library/${appType}/${instanceId}`
  );
  return response.data;
}

export async function syncMediaLibrary(
  appType: string,
  instanceId: string
): Promise<MediaLibraryResponse> {
  const response = await apiClient.get<MediaLibraryResponse>(
    `/media-library/${appType}/${instanceId}?sync=true`
  );
  return response.data;
}

export async function fetchCfScoreHistory(
  appType: string,
  instanceId: string,
  mediaId: number
): Promise<CfScoreHistoryResponse> {
  const response = await apiClient.get<CfScoreHistoryResponse>(
    `/media-library/${appType}/${instanceId}/${mediaId}/cf-history`
  );
  return response.data;
}

export async function searchMedia(
  appType: string,
  instanceId: string,
  mediaIds: number[]
): Promise<MediaSearchResponse> {
  const response = await apiClient.post<MediaSearchResponse>(
    '/media-library/search',
    {
      appType,
      instanceId,
      mediaIds
    }
  );
  return response.data;
}
