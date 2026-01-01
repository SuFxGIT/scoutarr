import apiClient from './apiClient';
import type { MediaLibraryResponse, MediaSearchResponse } from '@scoutarr/shared';

export async function fetchMediaLibrary(
  appType: string,
  instanceId: string,
  skipFilters?: boolean
): Promise<MediaLibraryResponse> {
  const params = skipFilters ? { skipFilters: 'true' } : {};
  const response = await apiClient.get<MediaLibraryResponse>(
    `/media-library/${appType}/${instanceId}`,
    { params }
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
