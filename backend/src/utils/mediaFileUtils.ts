/**
 * Utility functions for extracting file information from media items
 * Centralizes logic for handling different file types (movie, episode, track, book)
 */

interface FileInfo {
  dateImported: string | undefined;
  hasFile: boolean;
  customFormatScore: number | undefined;
}

interface MediaWithFiles {
  movieFile?: { dateAdded?: string; customFormatScore?: number };
  episodeFile?: { dateAdded?: string; customFormatScore?: number };
  trackFiles?: Array<{ dateAdded?: string; customFormatScore?: number }>;
  bookFiles?: Array<{ dateAdded?: string; customFormatScore?: number }>;
  [key: string]: unknown;
}

/**
 * Extracts file information (dateImported, hasFile, customFormatScore) from a media item
 * Handles all file types: movieFile, episodeFile, trackFiles, bookFiles
 */
export function extractFileInfo(media: MediaWithFiles): FileInfo {
  let dateImported: string | undefined;
  let customFormatScore: number | undefined;
  let hasFile = false;

  // Radarr - movieFile
  if (media.movieFile?.dateAdded) {
    dateImported = media.movieFile.dateAdded;
    hasFile = true;
    customFormatScore = media.movieFile.customFormatScore;
  }
  // Sonarr - episodeFile
  else if (media.episodeFile?.dateAdded) {
    dateImported = media.episodeFile.dateAdded;
    hasFile = true;
    customFormatScore = media.episodeFile.customFormatScore;
  }
  // Lidarr - trackFiles (use most recent)
  else if (media.trackFiles && media.trackFiles.length > 0) {
    const dates = media.trackFiles
      .map(f => f.dateAdded)
      .filter((d): d is string => !!d);
    
    if (dates.length > 0) {
      dateImported = dates.sort().reverse()[0]; // Most recent
      hasFile = true;
      const trackWithScore = media.trackFiles.find(f => f.customFormatScore !== undefined);
      customFormatScore = trackWithScore?.customFormatScore;
    }
  }
  // Readarr - bookFiles (use most recent)
  else if (media.bookFiles && media.bookFiles.length > 0) {
    const dates = media.bookFiles
      .map(f => f.dateAdded)
      .filter((d): d is string => !!d);
    
    if (dates.length > 0) {
      dateImported = dates.sort().reverse()[0]; // Most recent
      hasFile = true;
      const bookWithScore = media.bookFiles.find(f => f.customFormatScore !== undefined);
      customFormatScore = bookWithScore?.customFormatScore;
    }
  }

  return { dateImported, hasFile, customFormatScore };
}

/**
 * Extracts file information for database storage (returns hasFile as number)
 */
export function extractFileInfoForDb(media: MediaWithFiles): {
  dateImported: string | undefined;
  hasFile: number;
  customFormatScore: number | null;
} {
  const info = extractFileInfo(media);
  return {
    dateImported: info.dateImported,
    hasFile: info.hasFile ? 1 : 0,
    customFormatScore: info.customFormatScore ?? null
  };
}
