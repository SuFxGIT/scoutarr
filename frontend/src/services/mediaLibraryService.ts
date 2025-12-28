import axios from 'axios';
import type { MediaLibraryResponse, MediaSearchResponse } from '@scoutarr/shared';

export async function fetchMediaLibrary(
  appType: string,
  instanceId: string
): Promise<MediaLibraryResponse> {
  const response = await axios.get<MediaLibraryResponse>(
    `/api/media-library/${appType}/${instanceId}`
  );
  return response.data;
}

export async function triggerManualSearch(
  appType: string,
  instanceId: string,
  mediaIds: number[]
): Promise<MediaSearchResponse> {
  const response = await axios.post<MediaSearchResponse>(
    '/api/media-library/search',
    {
      appType,
      instanceId,
      mediaIds
    }
  );
  return response.data;
}
