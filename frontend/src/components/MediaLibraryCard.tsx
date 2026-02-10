import { useState, useMemo, useCallback, useEffect } from 'react';
import { useSearchParams, useLocation } from 'react-router-dom';
import { DataGrid, TreeDataGrid, Column, SelectColumn, SortColumn, RenderHeaderCellProps, RenderGroupCellProps, SELECT_COLUMN_KEY } from 'react-data-grid';
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
  SegmentedControl,
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

// Extended row type with formatted dates and computed grouping field
type MediaLibraryRow = MediaLibraryItem & {
  formattedLastSearched: string;
  formattedDateImported: string;
  seriesKey: string;
  seasonLabel: string;
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
function TitleCell({ row }: { row: MediaLibraryRow }) {
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
      </Text>
    </Flex>
  );
}

function EpisodeTitleCell({ row, flat }: { row: MediaLibraryRow; flat?: boolean }) {
  const epNum = `S${String(row.seasonNumber ?? 0).padStart(2, '0')}E${String(row.episodeNumber ?? 0).padStart(2, '0')}`;
  const fileIcon = row.hasFile
    ? <CheckCircledIcon style={{ color: 'var(--green-9)', flexShrink: 0 }} />
    : <CrossCircledIcon style={{ color: 'var(--red-9)', flexShrink: 0 }} />;
  const label = flat ? `${row.seriesTitle || row.title} - ${epNum}` : epNum;
  return (
    <Flex gap="2" align="center" style={flat ? { width: '100%', overflow: 'hidden' } : undefined}>
      {fileIcon}
      <Text size="2" truncate={flat}>{label}</Text>
    </Flex>
  );
}

function DateCell({ value }: { value: string }) {
  return (
    <Text size="2" color="gray">
      {value}
    </Text>
  );
}

function TagsCell({ row, scoutarrTags = [] }: { row: MediaLibraryRow; scoutarrTags?: string[] }) {
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

// Group cell renderer for Sonarr TreeDataGrid
// Custom renderer with overflow support for narrow grouping columns
function GroupCell({ label, props }: { label: string; props: RenderGroupCellProps<MediaLibraryRow> }) {
  const downloadedCount = props.childRows.filter(e => e.hasFile).length;
  const d = props.isExpanded ? 'M1 1 L 7 7 L 13 1' : 'M1 7 L 7 1 L 13 7';
  return (
    <span
      className="group-cell-overflow"
      tabIndex={props.tabIndex}
      onKeyDown={(e) => { if (e.key === 'Enter') props.toggleGroup(); }}
    >
      <svg viewBox="0 0 14 8" width="14" height="8" className="group-caret" aria-hidden="true">
        <path d={d} />
      </svg>
      <strong>{label}</strong>
      <span className="group-cell-count">({downloadedCount}/{props.childRows.length})</span>
    </span>
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

// Text/numeric filter header cell component
interface FilterHeaderCellProps extends RenderHeaderCellProps<MediaLibraryRow> {
  filterValue: string;
  onFilterChange: (value: string) => void;
  numeric?: boolean;
}

function TextFilterHeaderCell({ column, sortDirection, priority, filterValue, onFilterChange, numeric }: FilterHeaderCellProps) {
  return (
    <Flex direction="column" gap="1" style={{ width: '100%' }}>
      <HeaderCellTitle column={column} sortDirection={sortDirection} priority={priority} />
      <TextField.Root
        size="1"
        type={numeric ? 'number' : undefined}
        inputMode={numeric ? 'numeric' : undefined}
        placeholder={numeric ? `Min ${column.name}` : `Filter ${column.name}...`}
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
interface DropdownFilterHeaderCellProps extends RenderHeaderCellProps<MediaLibraryRow> {
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
  const [expandedGroupIds, setExpandedGroupIds] = useState<ReadonlySet<unknown>>(new Set());
  const [episodeMode, setEpisodeMode] = useState(false);
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

  // Map episode IDs to series IDs for Sonarr search
  const episodeToSeriesMap = useMemo(() => {
    if (!isSonarr || !mediaData?.media) return new Map<number, number>();
    const map = new Map<number, number>();
    for (const item of mediaData.media) {
      if (item.seriesId !== undefined) {
        map.set(item.id, item.seriesId);
      }
    }
    return map;
  }, [isSonarr, mediaData?.media]);

  // Manual search mutation
  const searchMutation = useMutation({
    mutationFn: async () => {
      if (!instanceInfo) throw new Error('No instance selected');

      let idsToSend = Array.from(selectedMediaIds);

      // For Sonarr: convert episode IDs to unique series IDs
      if (isSonarr) {
        const seriesIdSet = new Set<number>();
        for (const episodeId of idsToSend) {
          const seriesId = episodeToSeriesMap.get(episodeId);
          if (seriesId !== undefined) {
            seriesIdSet.add(seriesId);
          }
        }
        idsToSend = Array.from(seriesIdSet);
      }

      return searchMedia(
        instanceInfo.appType,
        instanceInfo.instanceId,
        idsToSend
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
    setExpandedGroupIds(new Set());
    setSearchParams({ instance: value });
  };

  const handleManualSearch = useCallback(async () => {
    if (selectedMediaIds.size === 0) return;
    searchMutation.mutate();
  }, [selectedMediaIds.size, searchMutation]);

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

  // Build grid rows: flat MediaLibraryRow[] for all app types
  const gridRows = useMemo((): MediaLibraryRow[] => {
    if (!mediaData?.media) return [];

    // Apply filters to raw data
    let filtered = mediaData.media;

    if (columnFilters.title.trim()) {
      const query = columnFilters.title.toLowerCase();
      filtered = filtered.filter(item => {
        // Match series/media title
        if (item.title.toLowerCase().includes(query)) return true;
        // For Sonarr: also match S##E## format
        if (item.seasonNumber !== undefined && item.episodeNumber !== undefined) {
          const epNum = `s${String(item.seasonNumber).padStart(2, '0')}e${String(item.episodeNumber).padStart(2, '0')}`;
          if (epNum.includes(query)) return true;
        }
        return false;
      });
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

    // Sort rows — scoped for Sonarr to preserve Series → Season → Episode hierarchy
    const sorted = [...filtered];

    const compareField = (a: MediaLibraryItem, b: MediaLibraryItem, columnKey: string): number => {
      if (columnKey === 'title') {
        return (a.seriesTitle || a.title).localeCompare(b.seriesTitle || b.title);
      } else if (columnKey === 'qualityProfileName') {
        return (a.qualityProfileName || '').localeCompare(b.qualityProfileName || '');
      } else if (columnKey === 'lastSearched' || columnKey === 'dateImported') {
        const aDate = a[columnKey] ? new Date(a[columnKey]!) : new Date(0);
        const bDate = b[columnKey] ? new Date(b[columnKey]!) : new Date(0);
        return compareAsc(aDate, bDate);
      } else if (columnKey === 'customFormatScore') {
        return (a.customFormatScore ?? -Infinity) - (b.customFormatScore ?? -Infinity);
      } else if (columnKey === 'tags') {
        const aTag = a.tags?.length > 0 ? a.tags[0] : '\uffff';
        const bTag = b.tags?.length > 0 ? b.tags[0] : '\uffff';
        return aTag.localeCompare(bTag);
      }
      return 0;
    };

    const naturalOrder = (a: MediaLibraryItem, b: MediaLibraryItem): number => {
      let cmp = (a.seriesTitle || a.title).localeCompare(b.seriesTitle || b.title);
      if (cmp !== 0) return cmp;
      cmp = (a.seasonNumber ?? 0) - (b.seasonNumber ?? 0);
      if (cmp !== 0) return cmp;
      return (a.episodeNumber ?? 0) - (b.episodeNumber ?? 0);
    };

    const SERIES_LEVEL_FIELDS = ['title', 'qualityProfileName', 'tags'];

    if (sortColumns.length > 0 && isSonarr && !episodeMode) {
      // Sonarr grouped mode: scoped sorting preserving hierarchy
      const { columnKey, direction } = sortColumns[0];
      const multiplier = direction === 'ASC' ? 1 : -1;

      if (SERIES_LEVEL_FIELDS.includes(columnKey)) {
        // Series-level sort: reorder series groups, keep natural order within
        sorted.sort((a, b) => {
          const fieldCmp = compareField(a, b, columnKey) * multiplier;
          if (fieldCmp !== 0) return fieldCmp;
          return naturalOrder(a, b);
        });
      } else {
        // Episode-level sort: keep series + seasons in natural order,
        // reorder episodes within each season
        sorted.sort((a, b) => {
          const nat = naturalOrder(a, b);
          // Same series+season? Sort by the selected field within
          const sameSeason = (a.seriesTitle || a.title) === (b.seriesTitle || b.title)
            && (a.seasonNumber ?? 0) === (b.seasonNumber ?? 0);
          return sameSeason ? compareField(a, b, columnKey) * multiplier : nat;
        });
      }
    } else if (sortColumns.length > 0) {
      // Episode mode or non-Sonarr: global sort across all rows
      const { columnKey, direction } = sortColumns[0];
      const multiplier = direction === 'ASC' ? 1 : -1;
      sorted.sort((a, b) => compareField(a, b, columnKey) * multiplier);
    } else if (isSonarr) {
      // No sort column active for Sonarr: natural order
      sorted.sort(naturalOrder);
    }

    return sorted.map(item => ({
      ...item,
      formattedLastSearched: item.lastSearched ? format(new Date(item.lastSearched), 'PP') : 'Never',
      formattedDateImported: item.dateImported ? format(new Date(item.dateImported), 'PP') : '',
      seriesKey: item.seriesId !== undefined
        ? `${item.seriesId}__${item.seriesTitle || item.title}`
        : '',
      seasonLabel: item.seasonNumber !== undefined
        ? (item.seasonNumber === 0 ? 'Specials' : `Season ${item.seasonNumber}`)
        : '',
    }));
  }, [mediaData?.media, sortColumns, columnFilters, isSonarr, episodeMode]);

  // Row grouper for TreeDataGrid
  const rowGrouper = useCallback(
    (rows: readonly MediaLibraryRow[], columnKey: string): Record<string, readonly MediaLibraryRow[]> => {
      const groups: Record<string, MediaLibraryRow[]> = {};
      for (const row of rows) {
        const key = String((row as unknown as Record<string, unknown>)[columnKey] ?? '');
        if (!groups[key]) groups[key] = [];
        groups[key].push(row);
      }
      return groups;
    },
    []
  );

  const sonarrGroupBy = useMemo((): readonly string[] => ['seriesKey', 'seasonLabel'], []);

  // Display count for header
  const displayCount = useMemo(() => {
    if (isSonarr) {
      return new Set(gridRows.map(r => r.seriesKey)).size;
    }
    return gridRows.length;
  }, [gridRows, isSonarr]);

  // Series count from selected episodes (for Sonarr search button)
  const selectedSeriesCount = useMemo(() => {
    if (!isSonarr) return 0;
    const seriesIds = new Set<number>();
    for (const episodeId of selectedMediaIds) {
      const seriesId = episodeToSeriesMap.get(episodeId);
      if (seriesId !== undefined) seriesIds.add(seriesId);
    }
    return seriesIds.size;
  }, [isSonarr, selectedMediaIds, episodeToSeriesMap]);

  const hasAnyInstances = useMemo(() => {
    if (!config) return false;
    return APP_TYPES.some((appType) => {
      const instances = config.applications[appType];
      return instances && instances.length > 0;
    });
  }, [config]);

  const rowKeyGetter = useCallback((row: MediaLibraryRow) => row.id, []);

  const handleColumnsReorder = useCallback((sourceKey: string, targetKey: string) => {
    if (sourceKey === 'title' || targetKey === 'title' ||
        sourceKey === SELECT_COLUMN_KEY || targetKey === SELECT_COLUMN_KEY) {
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

  // Column configuration
  const columns: readonly Column<MediaLibraryRow>[] = useMemo(() => {
    const allColumns: Record<string, Column<MediaLibraryRow>> = {
      qualityProfileName: {
        key: 'qualityProfileName',
        name: 'Quality Profile',
        width: 130,
        renderCell: ({ row }) => <Text size="2">{row.qualityProfileName || 'N/A'}</Text>,
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
        renderCell: ({ row }) => <DateCell value={row.formattedLastSearched} />,
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
        renderCell: ({ row }) => <DateCell value={row.formattedDateImported} />,
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
        renderCell: ({ row }) => <Text size="2">{row.customFormatScore ?? '-'}</Text>,
        renderHeaderCell: (props) => (
          <TextFilterHeaderCell
            {...props}
            numeric
            filterValue={columnFilters.cfScore}
            onFilterChange={(value: string) => handleFilterChange('cfScore', value)}
          />
        )
      },
      tags: {
        key: 'tags',
        name: 'Tags',
        width: 136,
        renderCell: ({ row }) => <TagsCell row={row} scoutarrTags={mediaData?.scoutarrTags} />,
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

    const cols: Column<MediaLibraryRow>[] = [];

    // Grouping columns for Sonarr TreeDataGrid (required for groupBy to work)
    // These columns are auto-frozen and render nothing in data rows (library overrides renderCell to null)
    // Skipped in episode mode since we use a flat DataGrid
    if (isSonarr && !episodeMode) {
      cols.push({
        key: 'seriesKey',
        name: '',
        width: 40,
        minWidth: 40,
        resizable: false,
        sortable: false,
        draggable: false,
        renderGroupCell: (props) => <GroupCell props={props} label={String(props.groupKey).replace(/^\d+__/, '')} />,
      });
      cols.push({
        key: 'seasonLabel',
        name: '',
        width: 40,
        minWidth: 40,
        resizable: false,
        sortable: false,
        draggable: false,
        renderGroupCell: (props) => <GroupCell props={props} label={String(props.groupKey)} />,
      });
    }

    // SelectColumn
    cols.push(SelectColumn as Column<MediaLibraryRow>);

    // Title column
    cols.push({
      key: 'title',
      name: 'Title',
      minWidth: 100,
      draggable: false,
      renderCell: isSonarr
        ? ({ row }) => <EpisodeTitleCell row={row} flat={episodeMode} />
        : ({ row }) => <TitleCell row={row} />,
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
  }, [columnFilters, handleFilterChange, filterOptions, mediaData?.scoutarrTags, columnOrder, isSonarr, episodeMode]);

  const sharedGridProps = {
    className: 'media-library-grid',
    'aria-label': 'Media Library',
    columns,
    rows: gridRows,
    rowKeyGetter,
    selectedRows: selectedMediaIds,
    onSelectedRowsChange: setSelectedMediaIds,
    sortColumns,
    onSortColumnsChange: setSortColumns,
    onColumnsReorder: handleColumnsReorder,
    rowHeight: 48,
    headerRowHeight: 68,
    defaultColumnOptions: { sortable: true, resizable: true, draggable: true },
    style: { height: '100%' } as const,
    onCellKeyDown: (_: unknown, event: { isDefaultPrevented: () => boolean; preventGridDefault: () => void }) => {
      if (event.isDefaultPrevented()) event.preventGridDefault();
    },
  };

  return (
    <Card>
      <Flex direction="column" gap="3">
        {/* Header */}
        <Flex align="center" justify="between" gap="3">
          <Heading size="5">Media Library</Heading>
          <Flex align="center" gap="3">
            {mediaData && (
              <Text size="2" color="gray">
                {episodeMode
                  ? `${gridRows.length} episodes`
                  : `${displayCount} of ${isSonarr ? `${new Set(mediaData.media.map(m => m.seriesId)).size} series` : `${mediaData.total} items`}`
                } ({selectedMediaIds.size} selected)
              </Text>
            )}
            {isSonarr && mediaData && (
              <SegmentedControl.Root
                size="1"
                value={episodeMode ? 'episodes' : 'series'}
                onValueChange={(value) => setEpisodeMode(value === 'episodes')}
              >
                <SegmentedControl.Item value="series">Series</SegmentedControl.Item>
                <SegmentedControl.Item value="episodes">Episodes</SegmentedControl.Item>
              </SegmentedControl.Root>
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
              {isSonarr && !episodeMode ? (
                <TreeDataGrid
                  {...sharedGridProps}
                  groupBy={sonarrGroupBy}
                  rowGrouper={rowGrouper}
                  expandedGroupIds={expandedGroupIds}
                  onExpandedGroupIdsChange={setExpandedGroupIds}
                />
              ) : (
                <DataGrid {...sharedGridProps} />
              )}
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
                    {isSonarr
                      ? `Search ${selectedSeriesCount} Series (${selectedMediaIds.size} episodes)`
                      : `Search ${selectedMediaIds.size} Selected`
                    }
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
