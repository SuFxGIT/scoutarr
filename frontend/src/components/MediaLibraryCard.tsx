import { useState, useMemo, useCallback, useEffect } from 'react';
import { useSearchParams, useLocation } from 'react-router-dom';
import { DataGrid, Column, SelectColumn, SortColumn, RenderHeaderCellProps, SELECT_COLUMN_KEY } from 'react-data-grid';
import 'react-data-grid/lib/styles.css';
import '../styles/media-library-grid.css';
import {
  Flex,
  Heading,
  Button,
  Card,
  Text,
  Separator,
  Spinner,
  Box,
  Select,
  Callout,
  TextField,
  Tooltip,
  Badge,
} from '@radix-ui/themes';
import {
  MagnifyingGlassIcon,
  InfoCircledIcon,
  CrossCircledIcon,
  BookmarkFilledIcon,
  BookmarkIcon,
  CheckCircledIcon,
  ClockIcon,
  DotFilledIcon,
  CalendarIcon,
  ChevronDownIcon,
  ChevronRightIcon,
} from '@radix-ui/react-icons';
import { useQuery, useMutation } from '@tanstack/react-query';
import { format, compareAsc } from 'date-fns';
import { toast } from 'sonner';
import { formatAppName, getErrorMessage } from '../utils/helpers';
import { AppIcon } from './icons/AppIcon';
import { fetchMediaLibrary, searchMedia } from '../services/mediaLibraryService';
import { useNavigation } from '../contexts/NavigationContext';
import type { MediaLibraryResponse, MediaLibraryItem } from '@scoutarr/shared';
import type { Config } from '../types/config';
import { APP_TYPES, AppType } from '../utils/constants';

// Extended row type with formatted dates for the grid
type MediaLibraryRow = MediaLibraryItem & {
  formattedLastSearched: string;
  formattedDateImported: string;
};

// Master Detail row types
type GridRow =
  | (MediaLibraryRow & {
      type: 'MASTER';
      expanded?: boolean;
      episodeCount?: number;
      downloadedCount?: number;
    })
  | {
      type: 'DETAIL';
      id: number;
      parentSeriesId: number;
    };

// Helper functions for status icons
function getStatusIcon(status: string) {
  const statusLower = status.toLowerCase();

  if (statusLower.includes('released') || statusLower.includes('available')) {
    return <CheckCircledIcon />;
  }
  if (statusLower.includes('cinemas') || statusLower.includes('theater')) {
    return <CalendarIcon />;
  }
  if (statusLower.includes('announced') || statusLower.includes('continuing') || statusLower.includes('upcoming')) {
    return <ClockIcon />;
  }
  if (statusLower.includes('missing') || statusLower.includes('ended')) {
    return <CrossCircledIcon />;
  }
  return <DotFilledIcon />;
}

function getMonitoredIcon(monitored: boolean) {
  return monitored ? <BookmarkFilledIcon /> : <BookmarkIcon />;
}

function getStatusTooltip(status: string): string {
  const statusLower = status.toLowerCase();

  if (statusLower.includes('released')) return 'Status: Released';
  if (statusLower.includes('available')) return 'Status: Available';
  if (statusLower.includes('cinemas') || statusLower.includes('theater')) return 'Status: In Cinemas';
  if (statusLower.includes('announced')) return 'Status: Announced';
  if (statusLower.includes('continuing')) return 'Status: Continuing';
  if (statusLower.includes('upcoming')) return 'Status: Upcoming';
  if (statusLower.includes('missing')) return 'Status: Missing';
  if (statusLower.includes('ended')) return 'Status: Ended';

  return `Status: ${status}`;
}

// Cell renderer components
interface MasterCellProps {
  row: GridRow & { type: 'MASTER' };
}

interface TagsCellProps extends MasterCellProps {
  scoutarrTags?: string[];
}

function TitleCell({ row }: MasterCellProps) {
  return (
    <Flex gap="2" align="center" style={{ width: '100%', overflow: 'hidden' }}>
      <Flex gap="1" align="center" style={{ flexShrink: 0 }}>
        <Tooltip content={row.monitored ? 'Monitored' : 'Not Monitored'}>
          <Box style={{ display: 'flex', alignItems: 'center' }}>
            {getMonitoredIcon(row.monitored)}
          </Box>
        </Tooltip>
        <Tooltip content={getStatusTooltip(row.status)}>
          <Box style={{ display: 'flex', alignItems: 'center' }}>
            {getStatusIcon(row.status)}
          </Box>
        </Tooltip>
      </Flex>
      <Text size="2" weight="medium" truncate style={{ flex: 1 }}>
        {row.title}
        {row.episodeCount !== undefined && (
          <Text size="1" color="gray"> ({row.downloadedCount}/{row.episodeCount})</Text>
        )}
      </Text>
    </Flex>
  );
}

function QualityProfileCell({ row }: MasterCellProps) {
  return <Text size="2">{row.qualityProfileName || 'N/A'}</Text>;
}

function DateCell({ value }: { value: string }) {
  return (
    <Text size="2" color="gray">
      {value}
    </Text>
  );
}

function CFScoreCell({ row }: MasterCellProps) {
  return <Text size="2">{row.customFormatScore ?? '-'}</Text>;
}

function TagsCell({ row, scoutarrTags = [] }: TagsCellProps) {
  if (!row.tags || row.tags.length === 0) {
    return null;
  }

  return (
    <Flex gap="1" wrap="wrap" style={{ maxWidth: '100%' }}>
      {row.tags.map((tag, index) => {
        const isScoutarrTag = scoutarrTags.includes(tag);
        return (
          <Badge
            key={index}
            size="1"
            variant="soft"
            color={isScoutarrTag ? "yellow" : "blue"}
          >
            {tag}
          </Badge>
        );
      })}
    </Flex>
  );
}

// Episode Detail Panel for expanded Sonarr series
function EpisodeDetailPanel({ episodes }: { episodes: MediaLibraryItem[] }) {
  // Group episodes by season
  const seasonMap = new Map<number, MediaLibraryItem[]>();
  for (const ep of episodes) {
    const season = ep.seasonNumber ?? 0;
    if (!seasonMap.has(season)) seasonMap.set(season, []);
    seasonMap.get(season)!.push(ep);
  }

  const sortedSeasons = Array.from(seasonMap.entries()).sort((a, b) => a[0] - b[0]);

  return (
    <div className="episode-detail-panel" onClick={(e) => e.stopPropagation()}>
      {sortedSeasons.map(([seasonNum, seasonEps]) => {
        const downloaded = seasonEps.filter(e => e.hasFile).length;
        return (
          <div key={seasonNum} className="episode-season-group">
            <div className="episode-season-header">
              <Text size="2" weight="bold">
                {seasonNum === 0 ? 'Specials' : `Season ${seasonNum}`}
              </Text>
              <Text size="1" color="gray"> ({downloaded}/{seasonEps.length})</Text>
            </div>
            <table className="episode-table">
              <tbody>
                {seasonEps
                  .sort((a, b) => (a.episodeNumber ?? 0) - (b.episodeNumber ?? 0))
                  .map(ep => (
                    <tr key={ep.id} className={ep.hasFile ? 'has-file' : 'missing-file'}>
                      <td className="ep-number">
                        <Text size="1" color="gray">
                          S{String(ep.seasonNumber ?? 0).padStart(2, '0')}E{String(ep.episodeNumber ?? 0).padStart(2, '0')}
                        </Text>
                      </td>
                      <td className="ep-title">
                        <Text size="1" truncate>{ep.episodeTitle || ep.title}</Text>
                      </td>
                      <td className="ep-status">
                        {ep.hasFile ? (
                          <CheckCircledIcon color="var(--green-9)" />
                        ) : (
                          <CrossCircledIcon color="var(--red-9)" />
                        )}
                      </td>
                      <td className="ep-score">
                        <Text size="1" color="gray">{ep.customFormatScore ?? '-'}</Text>
                      </td>
                      <td className="ep-date">
                        <Text size="1" color="gray">
                          {ep.dateImported ? format(new Date(ep.dateImported), 'PP') : ''}
                        </Text>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        );
      })}
    </div>
  );
}

// Expand/collapse button for series rows
function CellExpanderFormatter({ expanded, onCellExpand }: { expanded: boolean; onCellExpand: () => void }) {
  return (
    <div
      className="cell-expander"
      onClick={(e) => { e.stopPropagation(); onCellExpand(); }}
      onKeyDown={(e) => {
        if (e.key === ' ' || e.key === 'Enter') {
          e.preventDefault();
          onCellExpand();
        }
      }}
      tabIndex={0}
      role="button"
      aria-expanded={expanded}
    >
      {expanded ? <ChevronDownIcon /> : <ChevronRightIcon />}
    </div>
  );
}

// Filter state interface
interface ColumnFilters {
  title: string;
  qualityProfileName: string;
  cfScore: string;
  lastSearched: string;
  dateImported: string;
  tags: string;
}

// Shared header title component with sort indicators
interface HeaderCellTitleProps {
  column: { name: string | React.ReactElement };
  sortDirection?: 'ASC' | 'DESC';
  priority?: number;
}

function HeaderCellTitle({ column, sortDirection, priority }: HeaderCellTitleProps) {
  return (
    <Flex align="center" gap="1" justify="between">
      <Text size="1" weight="medium" style={{ textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        {column.name}
      </Text>
      {sortDirection && (
        <Flex align="center" gap="1">
          {priority !== undefined && priority > 0 && (
            <Text size="1" color="gray">{priority + 1}</Text>
          )}
          <Text size="1">{sortDirection === 'ASC' ? '\u2191' : '\u2193'}</Text>
        </Flex>
      )}
    </Flex>
  );
}

// Text filter header cell component
interface TextFilterHeaderCellProps extends RenderHeaderCellProps<GridRow> {
  filterValue: string;
  onFilterChange: (value: string) => void;
}

function TextFilterHeaderCell({ column, sortDirection, priority, filterValue, onFilterChange }: TextFilterHeaderCellProps) {
  return (
    <Flex direction="column" gap="1" style={{ width: '100%' }}>
      <HeaderCellTitle column={column} sortDirection={sortDirection} priority={priority} />
      <TextField.Root
        size="1"
        placeholder={`Filter ${column.name}...`}
        value={filterValue}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
          e.stopPropagation();
          onFilterChange(e.target.value);
        }}
        onClick={(e: React.MouseEvent) => e.stopPropagation()}
        onKeyDown={(e: React.KeyboardEvent) => e.stopPropagation()}
        onKeyUp={(e: React.KeyboardEvent) => e.stopPropagation()}
      />
    </Flex>
  );
}

// Numeric filter header cell component
interface NumericFilterHeaderCellProps extends RenderHeaderCellProps<GridRow> {
  filterValue: string;
  onFilterChange: (value: string) => void;
}

function NumericFilterHeaderCell({ column, sortDirection, priority, filterValue, onFilterChange }: NumericFilterHeaderCellProps) {
  return (
    <Flex direction="column" gap="1" style={{ width: '100%' }}>
      <HeaderCellTitle column={column} sortDirection={sortDirection} priority={priority} />
      <TextField.Root
        size="1"
        type="number"
        inputMode="numeric"
        placeholder={`Min ${column.name}`}
        value={filterValue}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
          e.stopPropagation();
          onFilterChange(e.target.value);
        }}
        onClick={(e: React.MouseEvent) => e.stopPropagation()}
        onKeyDown={(e: React.KeyboardEvent) => e.stopPropagation()}
        onKeyUp={(e: React.KeyboardEvent) => e.stopPropagation()}
      />
    </Flex>
  );
}

// Dropdown filter header cell component
interface DropdownFilterHeaderCellProps extends RenderHeaderCellProps<GridRow> {
  filterValue: string;
  onFilterChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
}

function DropdownFilterHeaderCell({ column, sortDirection, priority, filterValue, onFilterChange, options }: DropdownFilterHeaderCellProps) {
  return (
    <Flex direction="column" gap="1" style={{ width: '100%' }}>
      <HeaderCellTitle column={column} sortDirection={sortDirection} priority={priority} />
      <Select.Root
        value={filterValue}
        onValueChange={onFilterChange}
        size="1"
      >
        <Select.Trigger
          placeholder="All"
          onClick={(e: React.MouseEvent) => e.stopPropagation()}
        />
        <Select.Content
          position="popper"
          onClick={(e: React.MouseEvent) => e.stopPropagation()}
        >
          {options.map(option => (
            <Select.Item key={option.value} value={option.value}>
              {option.label}
            </Select.Item>
          ))}
        </Select.Content>
      </Select.Root>
    </Flex>
  );
}

// Helper functions for localStorage persistence
function loadFromStorage<T>(key: string, defaultValue: T): T {
  try {
    const saved = localStorage.getItem(key);
    if (saved) {
      return JSON.parse(saved);
    }
  } catch {
    // Silent fail
  }
  return defaultValue;
}

function saveToStorage<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Silent fail
  }
}

interface MediaLibraryCardProps {
  config?: Config;
}

export function MediaLibraryCard({ config }: MediaLibraryCardProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const { setLastLibraryUrl } = useNavigation();

  const initialInstance = searchParams.get('instance');
  const [selectedInstance, setSelectedInstance] = useState<string | null>(initialInstance);
  const [selectedMediaIds, setSelectedMediaIds] = useState<Set<number>>(new Set());
  const [expandedSeriesIds, setExpandedSeriesIds] = useState<Set<number>>(new Set());
  const [sortColumns, setSortColumns] = useState<readonly SortColumn[]>(() =>
    loadFromStorage('scoutarr_media_library_sort_columns', [{ columnKey: 'title', direction: 'ASC' }])
  );
  const [columnFilters, setColumnFilters] = useState<ColumnFilters>({
    title: '',
    qualityProfileName: 'all',
    cfScore: '',
    lastSearched: '',
    dateImported: '',
    tags: 'all'
  });
  const [columnOrder, setColumnOrder] = useState<readonly string[]>(() =>
    loadFromStorage('scoutarr_media_library_column_order', [
      'qualityProfileName',
      'lastSearched',
      'dateImported',
      'customFormatScore',
      'tags'
    ])
  );

  // Auto-select first available instance if none is selected
  useEffect(() => {
    if (selectedInstance || !config) return;
    for (const appType of APP_TYPES) {
      const instances = config.applications[appType] || [];
      if (instances.length > 0) {
        const firstInstance = instances[0];
        const instanceValue = `${appType}-${firstInstance.id}`;
        setSelectedInstance(instanceValue);
        setSearchParams({ instance: instanceValue });
        break;
      }
    }
  }, [config, selectedInstance, setSearchParams]);

  useEffect(() => {
    setLastLibraryUrl(location.pathname + location.search);
  }, [location.pathname, location.search, setLastLibraryUrl]);

  useEffect(() => {
    saveToStorage('scoutarr_media_library_column_order', columnOrder);
  }, [columnOrder]);

  useEffect(() => {
    saveToStorage('scoutarr_media_library_sort_columns', sortColumns);
  }, [sortColumns]);

  // Parse selected instance
  const instanceInfo = useMemo(() => {
    if (!selectedInstance) return null;
    const parts = selectedInstance.split('-');
    const appType = parts[0] as AppType;
    const instanceId = parts.slice(1).join('-');
    return { appType, instanceId };
  }, [selectedInstance]);

  const isSonarr = instanceInfo?.appType === 'sonarr';

  // Fetch media library
  const {
    data: mediaData,
    isLoading,
    error,
    refetch,
  } = useQuery<MediaLibraryResponse>({
    queryKey: ['mediaLibrary', selectedInstance],
    queryFn: async () => {
      if (!instanceInfo) return { media: [], total: 0, instanceName: '', appType: '' };
      return fetchMediaLibrary(instanceInfo.appType, instanceInfo.instanceId);
    },
    enabled: !!instanceInfo,
    staleTime: 30000,
  });

  // Manual search mutation
  const searchMutation = useMutation({
    mutationFn: async () => {
      if (!instanceInfo) throw new Error('No instance selected');
      return searchMedia(
        instanceInfo.appType,
        instanceInfo.instanceId,
        Array.from(selectedMediaIds)
      );
    },
    onSuccess: (data) => {
      toast.success(data.message);
      setSelectedMediaIds(new Set());
      refetch();
    },
    onError: (error: unknown) => {
      toast.error('Search failed: ' + getErrorMessage(error));
    },
  });

  const handleInstanceChange = (value: string) => {
    setSelectedInstance(value);
    setSelectedMediaIds(new Set());
    setExpandedSeriesIds(new Set());
    setSearchParams({ instance: value });
  };

  const handleManualSearch = useCallback(async () => {
    if (selectedMediaIds.size === 0) return;
    searchMutation.mutate();
  }, [selectedMediaIds.size, searchMutation]);

  const toggleExpand = useCallback((seriesId: number) => {
    setExpandedSeriesIds(prev => {
      const next = new Set(prev);
      if (next.has(seriesId)) {
        next.delete(seriesId);
      } else {
        next.add(seriesId);
      }
      return next;
    });
  }, []);

  // Extract unique values for dropdown filters
  const filterOptions = useMemo(() => {
    if (!mediaData?.media) return { qualityProfiles: [], tags: [] };

    const qualityProfiles = Array.from(new Set(
      mediaData.media
        .map(item => item.qualityProfileName)
        .filter((name): name is string => !!name)
    )).sort();

    const allTags = new Set<string>();
    mediaData.media.forEach(item => {
      if (item.tags && Array.isArray(item.tags)) {
        item.tags.forEach(tag => allTags.add(tag));
      }
    });
    const tags = Array.from(allTags).sort();

    return { qualityProfiles, tags };
  }, [mediaData?.media]);

  const handleFilterChange = useCallback((columnKey: keyof ColumnFilters, value: string) => {
    setColumnFilters(prev => ({ ...prev, [columnKey]: value }));
  }, []);

  // Build episode map for Sonarr detail panels
  const episodesBySeriesId = useMemo(() => {
    if (!isSonarr || !mediaData?.media) return new Map<number, MediaLibraryItem[]>();
    const map = new Map<number, MediaLibraryItem[]>();
    for (const item of mediaData.media) {
      if (item.seriesId === undefined) continue;
      if (!map.has(item.seriesId)) map.set(item.seriesId, []);
      map.get(item.seriesId)!.push(item);
    }
    return map;
  }, [isSonarr, mediaData?.media]);

  // Build grid rows: flat for Radarr, grouped master-detail for Sonarr
  const gridRows = useMemo((): GridRow[] => {
    if (!mediaData?.media) return [];

    // Apply filters to raw data
    let filtered = mediaData.media;

    if (columnFilters.title.trim()) {
      const query = columnFilters.title.toLowerCase();
      // For Sonarr, filter matches series title; for others, media title
      filtered = filtered.filter(item => item.title.toLowerCase().includes(query));
    }
    if (columnFilters.qualityProfileName !== 'all') {
      filtered = filtered.filter(item => item.qualityProfileName === columnFilters.qualityProfileName);
    }
    if (columnFilters.cfScore.trim()) {
      const minScore = Number(columnFilters.cfScore);
      if (!Number.isNaN(minScore)) {
        filtered = filtered.filter(item => (item.customFormatScore ?? -Infinity) >= minScore);
      }
    }
    const filterByDate = (dateField: 'lastSearched' | 'dateImported', query: string) => {
      return (item: MediaLibraryItem) => {
        const date = item[dateField];
        const formatted = date ? format(new Date(date), 'PP') : (dateField === 'lastSearched' ? 'Never' : '');
        return formatted.toLowerCase().includes(query.toLowerCase());
      };
    };
    if (columnFilters.lastSearched.trim()) {
      filtered = filtered.filter(filterByDate('lastSearched', columnFilters.lastSearched));
    }
    if (columnFilters.dateImported.trim()) {
      filtered = filtered.filter(filterByDate('dateImported', columnFilters.dateImported));
    }
    if (columnFilters.tags !== 'all') {
      filtered = filtered.filter(item => {
        if (!item.tags || !Array.isArray(item.tags)) return false;
        return item.tags.includes(columnFilters.tags);
      });
    }

    if (isSonarr) {
      // Group episodes by series, build MASTER + DETAIL rows
      const seriesMap = new Map<number, MediaLibraryItem[]>();
      for (const item of filtered) {
        const sid = item.seriesId!;
        if (!seriesMap.has(sid)) seriesMap.set(sid, []);
        seriesMap.get(sid)!.push(item);
      }

      // Build series-level MASTER rows with aggregated data
      const seriesRows: Array<GridRow & { type: 'MASTER' }> = [];
      for (const [seriesId, episodes] of seriesMap) {
        const first = episodes[0];
        const downloadedCount = episodes.filter(e => e.hasFile).length;
        const mostRecentImport = episodes
          .map(e => e.dateImported)
          .filter((d): d is string => !!d)
          .sort()
          .reverse()[0];
        const minCfScore = episodes
          .map(e => e.customFormatScore)
          .filter((s): s is number => s !== undefined)
          .sort((a, b) => a - b)[0];

        seriesRows.push({
          type: 'MASTER',
          id: seriesId,
          title: first.seriesTitle || first.title,
          monitored: first.monitored,
          status: first.status,
          qualityProfileName: first.qualityProfileName,
          tags: first.tags,
          lastSearched: first.lastSearched,
          dateImported: mostRecentImport,
          customFormatScore: minCfScore,
          hasFile: downloadedCount > 0,
          seriesId: seriesId,
          seriesTitle: first.seriesTitle,
          expanded: expandedSeriesIds.has(seriesId),
          episodeCount: episodes.length,
          downloadedCount,
          formattedLastSearched: first.lastSearched ? format(new Date(first.lastSearched), 'PP') : 'Never',
          formattedDateImported: mostRecentImport ? format(new Date(mostRecentImport), 'PP') : '',
        });
      }

      // Sort series rows
      if (sortColumns.length > 0) {
        const { columnKey, direction } = sortColumns[0];
        const multiplier = direction === 'ASC' ? 1 : -1;
        seriesRows.sort((a, b) => {
          let cmp = 0;
          if (columnKey === 'title') {
            cmp = a.title.localeCompare(b.title);
          } else if (columnKey === 'qualityProfileName') {
            cmp = (a.qualityProfileName || '').localeCompare(b.qualityProfileName || '');
          } else if (columnKey === 'lastSearched' || columnKey === 'dateImported') {
            const aDate = a[columnKey] ? new Date(a[columnKey]!) : new Date(0);
            const bDate = b[columnKey] ? new Date(b[columnKey]!) : new Date(0);
            cmp = compareAsc(aDate, bDate);
          } else if (columnKey === 'customFormatScore') {
            cmp = (a.customFormatScore ?? -Infinity) - (b.customFormatScore ?? -Infinity);
          } else if (columnKey === 'tags') {
            const aTag = a.tags?.length > 0 ? a.tags[0] : '\uffff';
            const bTag = b.tags?.length > 0 ? b.tags[0] : '\uffff';
            cmp = aTag.localeCompare(bTag);
          }
          return cmp * multiplier;
        });
      }

      // Interleave DETAIL rows for expanded series
      const rows: GridRow[] = [];
      for (const sr of seriesRows) {
        rows.push(sr);
        if (expandedSeriesIds.has(sr.id)) {
          rows.push({
            type: 'DETAIL',
            id: -(sr.id),
            parentSeriesId: sr.id,
          });
        }
      }
      return rows;

    } else {
      // Non-Sonarr: flat MASTER rows (same as before)
      const sorted = [...filtered];
      if (sortColumns.length > 0) {
        const { columnKey, direction } = sortColumns[0];
        const multiplier = direction === 'ASC' ? 1 : -1;

        const compareDates = (dateField: 'lastSearched' | 'dateImported') => {
          return (a: MediaLibraryItem, b: MediaLibraryItem) => {
            const aDate = a[dateField] ? new Date(a[dateField]!) : new Date(0);
            const bDate = b[dateField] ? new Date(b[dateField]!) : new Date(0);
            return compareAsc(aDate, bDate);
          };
        };

        sorted.sort((a, b) => {
          let comparison = 0;
          if (columnKey === 'title') {
            comparison = a.title.localeCompare(b.title);
          } else if (columnKey === 'qualityProfileName') {
            comparison = (a.qualityProfileName || '').localeCompare(b.qualityProfileName || '');
          } else if (columnKey === 'lastSearched' || columnKey === 'dateImported') {
            comparison = compareDates(columnKey)(a, b);
          } else if (columnKey === 'customFormatScore') {
            comparison = (a.customFormatScore ?? -Infinity) - (b.customFormatScore ?? -Infinity);
          } else if (columnKey === 'tags') {
            const aTag = a.tags?.length > 0 ? a.tags[0] : '\uffff';
            const bTag = b.tags?.length > 0 ? b.tags[0] : '\uffff';
            comparison = aTag.localeCompare(bTag);
          }
          return comparison * multiplier;
        });
      }

      return sorted.map(item => ({
        ...item,
        type: 'MASTER' as const,
        formattedLastSearched: item.lastSearched ? format(new Date(item.lastSearched), 'PP') : 'Never',
        formattedDateImported: item.dateImported ? format(new Date(item.dateImported), 'PP') : '',
      }));
    }
  }, [mediaData?.media, sortColumns, columnFilters, isSonarr, expandedSeriesIds]);

  // Count of MASTER rows for display
  const masterRowCount = useMemo(
    () => gridRows.filter(r => r.type === 'MASTER').length,
    [gridRows]
  );

  const hasAnyInstances = useMemo(() => {
    if (!config) return false;
    return APP_TYPES.some((appType) => {
      const instances = config.applications[appType];
      return instances && instances.length > 0;
    });
  }, [config]);

  const rowKeyGetter = useCallback((row: GridRow) => row.id, []);

  const handleColumnsReorder = useCallback((sourceKey: string, targetKey: string) => {
    if (sourceKey === 'title' || targetKey === 'title' ||
        sourceKey === SELECT_COLUMN_KEY || targetKey === SELECT_COLUMN_KEY ||
        sourceKey === 'expanded' || targetKey === 'expanded') {
      return;
    }

    setColumnOrder((prevOrder) => {
      const newOrder = [...prevOrder];
      const sourceIndex = newOrder.indexOf(sourceKey);
      const targetIndex = newOrder.indexOf(targetKey);
      if (sourceIndex === -1 || targetIndex === -1) return prevOrder;
      const [removed] = newOrder.splice(sourceIndex, 1);
      newOrder.splice(targetIndex, 0, removed);
      return newOrder;
    });
  }, []);

  // Total column count for colSpan on DETAIL rows
  const totalColumnCount = useMemo(() => {
    // select + expand (if sonarr) + title + reorderable columns
    return (isSonarr ? 1 : 0) + 1 + 1 + columnOrder.length;
  }, [isSonarr, columnOrder.length]);

  // Column configuration
  const columns: readonly Column<GridRow>[] = useMemo(() => {
    const allColumns: Record<string, Column<GridRow>> = {
      qualityProfileName: {
        key: 'qualityProfileName',
        name: 'Quality Profile',
        width: 130,
        renderCell: (props) => props.row.type === 'DETAIL' ? null : <QualityProfileCell row={props.row} />,
        renderHeaderCell: (props) => (
          <DropdownFilterHeaderCell
            {...props}
            filterValue={columnFilters.qualityProfileName}
            onFilterChange={(value) => handleFilterChange('qualityProfileName', value)}
            options={[
              { value: 'all', label: 'All' },
              ...filterOptions.qualityProfiles.map(profile => ({ value: profile, label: profile }))
            ]}
          />
        )
      },
      lastSearched: {
        key: 'lastSearched',
        name: 'Searched',
        width: 115,
        sortable: true,
        renderCell: (props) => props.row.type === 'DETAIL' ? null : <DateCell value={props.row.formattedLastSearched} />,
        renderHeaderCell: (props) => (
          <TextFilterHeaderCell
            {...props}
            filterValue={columnFilters.lastSearched}
            onFilterChange={(value) => handleFilterChange('lastSearched', value)}
          />
        )
      },
      dateImported: {
        key: 'dateImported',
        name: 'Imported',
        width: 115,
        sortable: true,
        renderCell: (props) => props.row.type === 'DETAIL' ? null : <DateCell value={props.row.formattedDateImported} />,
        renderHeaderCell: (props) => (
          <TextFilterHeaderCell
            {...props}
            filterValue={columnFilters.dateImported}
            onFilterChange={(value) => handleFilterChange('dateImported', value)}
          />
        )
      },
      customFormatScore: {
        key: 'customFormatScore',
        name: 'CF Score',
        width: 100,
        renderCell: (props) => props.row.type === 'DETAIL' ? null : <CFScoreCell row={props.row} />,
        renderHeaderCell: (props) => (
          <NumericFilterHeaderCell
            {...props}
            filterValue={columnFilters.cfScore}
            onFilterChange={(value) => handleFilterChange('cfScore', value)}
          />
        )
      },
      tags: {
        key: 'tags',
        name: 'Tags',
        width: 136,
        sortable: true,
        renderCell: (props) => props.row.type === 'DETAIL' ? null : <TagsCell row={props.row} scoutarrTags={mediaData?.scoutarrTags} />,
        renderHeaderCell: (props) => (
          <DropdownFilterHeaderCell
            {...props}
            filterValue={columnFilters.tags}
            onFilterChange={(value) => handleFilterChange('tags', value)}
            options={[
              { value: 'all', label: 'All' },
              ...filterOptions.tags.map(tag => ({ value: tag, label: tag }))
            ]}
          />
        )
      }
    };

    const cols: Column<GridRow>[] = [];

    // Expand column (Sonarr only)
    if (isSonarr) {
      cols.push({
        key: 'expanded',
        name: '',
        width: 36,
        minWidth: 36,
        maxWidth: 36,
        resizable: false,
        sortable: false,
        draggable: false,
        colSpan(args) {
          if (args.type === 'ROW' && args.row.type === 'DETAIL') {
            return totalColumnCount;
          }
          return undefined;
        },
        cellClass(row) {
          return row.type === 'DETAIL' ? 'detail-cell' : undefined;
        },
        renderCell({ row }) {
          if (row.type === 'DETAIL') {
            const episodes = episodesBySeriesId.get(row.parentSeriesId) || [];
            return <EpisodeDetailPanel episodes={episodes} />;
          }
          return (
            <CellExpanderFormatter
              expanded={!!row.expanded}
              onCellExpand={() => toggleExpand(row.id)}
            />
          );
        }
      });
    }

    // SelectColumn
    cols.push({
      ...SelectColumn,
      renderCell(props) {
        if (props.row.type === 'DETAIL') return null;
        return SelectColumn.renderCell!(props);
      }
    } as Column<GridRow>);

    // Title column
    cols.push({
      key: 'title',
      name: 'Title',
      minWidth: 100,
      draggable: false,
      renderCell: (props) => props.row.type === 'DETAIL' ? null : <TitleCell row={props.row} />,
      renderHeaderCell: (props) => (
        <TextFilterHeaderCell
          {...props}
          filterValue={columnFilters.title}
          onFilterChange={(value) => handleFilterChange('title', value)}
        />
      )
    });

    // Reorderable columns
    cols.push(...columnOrder.map(key => allColumns[key]));

    return cols;
  }, [columnFilters, handleFilterChange, filterOptions, mediaData?.scoutarrTags, columnOrder, isSonarr, totalColumnCount, expandedSeriesIds, episodesBySeriesId, toggleExpand]);

  // Custom selection handler that ignores DETAIL rows
  const handleSelectedRowsChange = useCallback((newSelection: Set<number>) => {
    // Filter out negative IDs (DETAIL rows)
    const filtered = new Set<number>();
    for (const id of newSelection) {
      if (id >= 0) filtered.add(id);
    }
    setSelectedMediaIds(filtered);
  }, []);

  // Dynamic row height: DETAIL rows are taller
  const getRowHeight = useCallback((row: GridRow) => {
    if (row.type === 'DETAIL') {
      const episodes = episodesBySeriesId.get(row.parentSeriesId) || [];
      // Estimate: ~24px per episode + ~32px per season header + 16px padding
      const seasonCount = new Set(episodes.map(e => e.seasonNumber ?? 0)).size;
      return Math.min(Math.max(episodes.length * 24 + seasonCount * 32 + 16, 100), 500);
    }
    return 48;
  }, [episodesBySeriesId]);

  return (
    <Card>
      <Flex direction="column" gap="3">
        {/* Header */}
        <Flex align="center" justify="between" gap="3">
          <Heading size="5">Media Library</Heading>
          <Flex align="center" gap="3">
            {mediaData && (
              <Text size="2" color="gray">
                {masterRowCount} of {isSonarr ? `${new Set(mediaData.media.map(m => m.seriesId)).size} series` : `${mediaData.total} items`} ({selectedMediaIds.size} selected)
              </Text>
            )}
            {config && hasAnyInstances && (
              <Select.Root value={selectedInstance || ''} onValueChange={handleInstanceChange}>
                  <Select.Trigger style={{ width: '220px' }} placeholder="Choose an instance..." />
                <Select.Content position="popper">
                  {APP_TYPES.map((appType) => {
                    const instances = config.applications[appType] || [];
                    if (instances.length === 0) return null;

                    return (
                      <Select.Group key={appType}>
                        <Select.Label>{formatAppName(appType)}</Select.Label>
                        {instances.map((inst) => (
                          <Select.Item key={`${appType}-${inst.id}`} value={`${appType}-${inst.id}`}>
                            <Flex align="center" gap="2">
                              <AppIcon app={appType} size={16} variant="light" />
                              {inst.name || `${appType}-${inst.id}`}
                            </Flex>
                          </Select.Item>
                        ))}
                      </Select.Group>
                    );
                  })}
                </Select.Content>
              </Select.Root>
            )}
          </Flex>
        </Flex>
        <Separator size="4" />

        {(!config || !hasAnyInstances) && (
          <Callout.Root color="orange">
            <Callout.Icon>
              <InfoCircledIcon />
            </Callout.Icon>
            <Callout.Text>
              No instances configured. Please add instances in Settings.
            </Callout.Text>
          </Callout.Root>
        )}

        {isLoading && (
          <Flex justify="center" p="6">
            <Spinner size="3" />
          </Flex>
        )}

        {error && !isLoading && (
          <Callout.Root color="red">
            <Callout.Icon>
              <CrossCircledIcon />
            </Callout.Icon>
            <Callout.Text>Failed to load media: {getErrorMessage(error)}</Callout.Text>
          </Callout.Root>
        )}

        {!selectedInstance && !isLoading && (
          <Box p="6">
            <Text size="2" color="gray" align="center">
              No instances configured. Add an instance in Settings to view media.
            </Text>
          </Box>
        )}

        {mediaData && mediaData.media.length === 0 && (
          <Box p="6">
            <Text size="2" color="gray" align="center">
              No media found for this instance
            </Text>
          </Box>
        )}

        {mediaData && mediaData.media.length > 0 && (
          <>
            <Box style={{ height: '900px' }}>
              <DataGrid
                className="media-library-grid"
                aria-label="Media Library"
                columns={columns}
                rows={gridRows}
                rowKeyGetter={rowKeyGetter}
                selectedRows={selectedMediaIds}
                onSelectedRowsChange={handleSelectedRowsChange}
                sortColumns={sortColumns}
                onSortColumnsChange={setSortColumns}
                onColumnsReorder={handleColumnsReorder}
                rowHeight={getRowHeight}
                headerRowHeight={68}
                defaultColumnOptions={{
                  sortable: true,
                  resizable: true,
                  draggable: true
                }}
                style={{ height: '100%' }}
                enableVirtualization={!isSonarr || expandedSeriesIds.size === 0}
                onCellKeyDown={(_, event) => {
                  if (event.isDefaultPrevented()) {
                    event.preventGridDefault();
                  }
                }}
              />
            </Box>

            <Flex justify="end" gap="2" pt="3">
              <Button
                variant="outline"
                onClick={() => setSelectedMediaIds(new Set())}
                disabled={selectedMediaIds.size === 0}
              >
                Clear Selection
              </Button>
              <Button
                onClick={handleManualSearch}
                disabled={selectedMediaIds.size === 0 || searchMutation.isPending}
              >
                {searchMutation.isPending ? (
                  <>
                    <Spinner size="1" />
                    Searching...
                  </>
                ) : (
                  <>
                    <MagnifyingGlassIcon />
                    Search {selectedMediaIds.size} Selected
                  </>
                )}
              </Button>
            </Flex>
          </>
        )}
      </Flex>
    </Card>
  );
}
