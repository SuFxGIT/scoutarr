import { useState, useMemo, useCallback, useEffect } from 'react';
import { useSearchParams, useLocation } from 'react-router-dom';
import { DataGrid, Column, SelectColumn, SortColumn, RenderHeaderCellProps } from 'react-data-grid';
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
  Switch,
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
  BadgeIcon,
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

// Helper functions for status icons
function getStatusIcon(status: string) {
  const statusLower = status.toLowerCase();

  // Released - available to download
  if (statusLower.includes('released') || statusLower.includes('available')) {
    return <CheckCircledIcon />;
  }

  // In Cinemas - theatrical release
  if (statusLower.includes('cinemas') || statusLower.includes('theater')) {
    return <CalendarIcon />;
  }

  // Announced/Upcoming - not yet available
  if (statusLower.includes('announced') || statusLower.includes('continuing') || statusLower.includes('upcoming')) {
    return <ClockIcon />;
  }

  // Missing/Ended
  if (statusLower.includes('missing') || statusLower.includes('ended')) {
    return <CrossCircledIcon />;
  }

  return <DotFilledIcon />; // Default
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
interface TitleCellProps {
  row: MediaLibraryRow;
}

function TitleCell({ row }: TitleCellProps) {
  const tagsList = row.tags && row.tags.length > 0 ? row.tags.join(', ') : null;

  return (
    <Flex gap="2" align="center" style={{ width: '100%', overflow: 'hidden' }}>
      <Flex gap="1" align="center" style={{ flexShrink: 0 }}>
        <Tooltip content={getStatusTooltip(row.status)}>
          <Box style={{ display: 'flex', alignItems: 'center' }}>
            {getStatusIcon(row.status)}
          </Box>
        </Tooltip>
        <Tooltip content={row.monitored ? 'Monitored' : 'Not Monitored'}>
          <Box style={{ display: 'flex', alignItems: 'center' }}>
            {getMonitoredIcon(row.monitored)}
          </Box>
        </Tooltip>
        {tagsList && (
          <Tooltip content={tagsList}>
            <Box style={{ display: 'flex', alignItems: 'center' }}>
              <BadgeIcon width="16" height="16" />
            </Box>
          </Tooltip>
        )}
      </Flex>
      <Text
        size="2"
        weight="medium"
        truncate
        style={{ flex: 1 }}
      >
        {row.title}
      </Text>
    </Flex>
  );
}

function QualityProfileCell({ row }: TitleCellProps) {
  return <Text size="2">{row.qualityProfileName || 'N/A'}</Text>;
}

function LastSearchedCell({ row }: TitleCellProps) {
  return (
    <Text size="2" color="gray">
      {row.formattedLastSearched}
    </Text>
  );
}

function LastImportedCell({ row }: TitleCellProps) {
  return (
    <Text size="2" color="gray">
      {row.formattedDateImported}
    </Text>
  );
}

function CFScoreCell({ row }: TitleCellProps) {
  return <Text size="2">{row.customFormatScore ?? '-'}</Text>;
}

// Filter state interface
interface ColumnFilters {
  title: string;
  qualityProfileName: string; // 'all' or specific profile
  cfScore: string;
  lastSearched: string;
  dateImported: string;
}

// Text filter header cell component
interface TextFilterHeaderCellProps extends RenderHeaderCellProps<MediaLibraryRow> {
  filterValue: string;
  onFilterChange: (value: string) => void;
}

function TextFilterHeaderCell({ column, sortDirection, priority, filterValue, onFilterChange }: TextFilterHeaderCellProps) {
  return (
    <Flex direction="column" gap="1" style={{ width: '100%' }}>
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
interface NumericFilterHeaderCellProps extends RenderHeaderCellProps<MediaLibraryRow> {
  filterValue: string;
  onFilterChange: (value: string) => void;
}

function NumericFilterHeaderCell({ column, sortDirection, priority, filterValue, onFilterChange }: NumericFilterHeaderCellProps) {
  return (
    <Flex direction="column" gap="1" style={{ width: '100%' }}>
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
interface DropdownFilterHeaderCellProps extends RenderHeaderCellProps<MediaLibraryRow> {
  filterValue: string;
  onFilterChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
}

function DropdownFilterHeaderCell({ column, sortDirection, priority, filterValue, onFilterChange, options }: DropdownFilterHeaderCellProps) {
  return (
    <Flex direction="column" gap="1" style={{ width: '100%' }}>
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

// Toggle filter header cell component for boolean filters
interface ToggleFilterHeaderCellProps extends RenderHeaderCellProps<MediaLibraryRow> {
  filterValue: string;
  onFilterChange: (value: string) => void;
}

function ToggleFilterHeaderCell({ column, sortDirection, priority, filterValue, onFilterChange }: ToggleFilterHeaderCellProps) {
  // Cycle through: all -> true -> false -> all
  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (filterValue === 'all') {
      onFilterChange('true');
    } else if (filterValue === 'true') {
      onFilterChange('false');
    } else {
      onFilterChange('all');
    }
  };

  const getFilterLabel = () => {
    if (filterValue === 'true') return 'Monitored';
    if (filterValue === 'false') return 'Not Monitored';
    return 'All';
  };

  const getFilterColor = () => {
    if (filterValue === 'true') return 'green';
    if (filterValue === 'false') return 'red';
    return 'gray';
  };

  return (
    <Flex direction="column" gap="1" style={{ width: '100%' }}>
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
      <Button
        size="1"
        variant="soft"
        color={getFilterColor()}
        onClick={handleToggle}
        style={{ width: '100%', cursor: 'pointer' }}
      >
        {getFilterLabel()}
      </Button>
    </Flex>
  );
}

// Standard header cell component for columns without filters
function StandardHeaderCell({ column, sortDirection, priority }: RenderHeaderCellProps<MediaLibraryRow>) {
  return (
    <Flex direction="column" gap="1" style={{ width: '100%' }}>
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
    </Flex>
  );
}

interface MediaLibraryCardProps {
  config?: Config;
}

export function MediaLibraryCard({ config }: MediaLibraryCardProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const { setLastLibraryUrl } = useNavigation();

  // Get initial instance from URL or use null
  const initialInstance = searchParams.get('instance');
  const [selectedInstance, setSelectedInstance] = useState<string | null>(initialInstance);
  const [selectedMediaIds, setSelectedMediaIds] = useState<Set<number>>(new Set());
  const [sortColumns, setSortColumns] = useState<readonly SortColumn[]>([
    { columnKey: 'title', direction: 'ASC' }
  ]);
  const [columnFilters, setColumnFilters] = useState<ColumnFilters>({
    title: '',
    qualityProfileName: 'all',
    cfScore: '',
    lastSearched: '',
    dateImported: ''
  });
  const showAllParam = searchParams.get('showAll');
  const [showAll, setShowAll] = useState<boolean>(showAllParam === 'true');

  // Update lastLibraryUrl whenever the location changes
  useEffect(() => {
    setLastLibraryUrl(location.pathname + location.search);
  }, [location.pathname, location.search, setLastLibraryUrl]);

  // Parse selected instance (format: "appType-instanceId")
  const instanceInfo = useMemo(() => {
    if (!selectedInstance) return null;
    const parts = selectedInstance.split('-');
    const appType = parts[0] as AppType;
    const instanceId = parts.slice(1).join('-'); // Handle instance IDs with dashes
    return { appType, instanceId };
  }, [selectedInstance]);

  // Fetch media library for selected instance
  const {
    data: mediaData,
    isLoading,
    error,
    refetch,
  } = useQuery<MediaLibraryResponse>({
    queryKey: ['mediaLibrary', selectedInstance, showAll],
    queryFn: async () => {
      if (!instanceInfo) return { media: [], total: 0, instanceName: '', appType: '' };
      return fetchMediaLibrary(instanceInfo.appType, instanceInfo.instanceId, showAll);
    },
    enabled: !!instanceInfo,
    staleTime: 30000, // 30 seconds
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
      setSelectedMediaIds(new Set()); // Clear selection
      refetch(); // Refresh media list to update last searched dates
    },
    onError: (error: unknown) => {
      toast.error('Search failed: ' + getErrorMessage(error));
    },
  });

  // Handlers
  const handleInstanceChange = (value: string) => {
    setSelectedInstance(value);
    setSelectedMediaIds(new Set()); // Clear selection when changing instance
    // Update URL to persist both instance and showAll
    if (showAll) {
      setSearchParams({ instance: value, showAll: 'true' });
    } else {
      setSearchParams({ instance: value });
    }
  };

  const handleShowAllChange = (checked: boolean) => {
    setShowAll(checked);
    // Update URL to persist state
    if (selectedInstance) {
      if (checked) {
        setSearchParams({ instance: selectedInstance, showAll: 'true' });
      } else {
        setSearchParams({ instance: selectedInstance });
      }
    }
  };

  const handleManualSearch = useCallback(async () => {
    if (selectedMediaIds.size === 0) return;
    searchMutation.mutate();
  }, [selectedMediaIds.size, searchMutation]);

  // Extract unique values for dropdown filters
  const filterOptions = useMemo(() => {
    if (!mediaData?.media) return { qualityProfiles: [] };

    const qualityProfiles = Array.from(new Set(
      mediaData.media
        .map(item => item.qualityProfileName)
        .filter((name): name is string => !!name)
    )).sort();

    return { qualityProfiles };
  }, [mediaData?.media]);

  // Column filter handlers
  const handleFilterChange = useCallback((columnKey: keyof ColumnFilters, value: string) => {
    setColumnFilters(prev => ({ ...prev, [columnKey]: value }));
  }, []);

  // Filter and sort media, pre-compute formatted dates
  const filteredAndSortedMedia = useMemo(() => {
    if (!mediaData?.media) return [];

    // Filter media based on search query and column filters
    let filtered = mediaData.media;
    
    // Apply column filters
    if (columnFilters.title.trim()) {
      const query = columnFilters.title.toLowerCase();
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
    if (columnFilters.lastSearched.trim()) {
      const query = columnFilters.lastSearched.toLowerCase();
      filtered = filtered.filter(item => {
        const formatted = item.lastSearched ? format(new Date(item.lastSearched), 'PPp') : 'Never';
        return formatted.toLowerCase().includes(query);
      });
    }
    if (columnFilters.dateImported.trim()) {
      const query = columnFilters.dateImported.toLowerCase();
      filtered = filtered.filter(item => {
        const formatted = item.dateImported ? format(new Date(item.dateImported), 'PPp') : '';
        return formatted.toLowerCase().includes(query);
      });
    }

    // Sort filtered results based on react-data-grid sort columns
    const sorted = [...filtered];
    if (sortColumns.length > 0) {
      const { columnKey, direction } = sortColumns[0];
      const multiplier = direction === 'ASC' ? 1 : -1;

      sorted.sort((a, b) => {
        let comparison = 0;

        if (columnKey === 'title') {
          comparison = a.title.localeCompare(b.title);
        } else if (columnKey === 'qualityProfileName') {
          const aProfile = a.qualityProfileName || '';
          const bProfile = b.qualityProfileName || '';
          comparison = aProfile.localeCompare(bProfile);
        } else if (columnKey === 'lastSearched') {
          const aDate = a.lastSearched ? new Date(a.lastSearched) : new Date(0);
          const bDate = b.lastSearched ? new Date(b.lastSearched) : new Date(0);
          comparison = compareAsc(aDate, bDate);
        } else if (columnKey === 'dateImported') {
          const aDate = a.dateImported ? new Date(a.dateImported) : new Date(0);
          const bDate = b.dateImported ? new Date(b.dateImported) : new Date(0);
          comparison = compareAsc(aDate, bDate);
        } else if (columnKey === 'customFormatScore') {
          const aScore = a.customFormatScore ?? -Infinity;
          const bScore = b.customFormatScore ?? -Infinity;
          comparison = aScore - bScore;
        }

        return comparison * multiplier;
      });
    }

    // Pre-compute formatted dates to avoid formatting on every render
    return sorted.map(item => ({
      ...item,
      formattedLastSearched: item.lastSearched ? format(new Date(item.lastSearched), 'PPp') : 'Never',
      formattedDateImported: item.dateImported ? format(new Date(item.dateImported), 'PPp') : ''
    }));
  }, [mediaData?.media, sortColumns, columnFilters]);

  // Check if any instances are configured
  const hasAnyInstances = useMemo(() => {
    if (!config) return false;
    return APP_TYPES.some((appType) => {
      const instances = config.applications[appType];
      return instances && instances.length > 0;
    });
  }, [config]);

  // Memoized rowKeyGetter for performance
  const rowKeyGetter = useCallback((row: MediaLibraryRow) => row.id, []);

  // Column configuration for DataGrid
  // Note: sortable and resizable are set via defaultColumnOptions, no need to repeat
  const columns: readonly Column<MediaLibraryRow>[] = useMemo(() => [
    SelectColumn,
    {
      key: 'title',
      name: 'Title',
      minWidth: 170,
      renderCell: (props) => <TitleCell row={props.row} />,
      renderHeaderCell: (props) => (
        <TextFilterHeaderCell
          {...props}
          filterValue={columnFilters.title}
          onFilterChange={(value) => handleFilterChange('title', value)}
        />
      )
    },
    {
      key: 'qualityProfileName',
      name: 'Quality Profile',
      minWidth: 130,
      renderCell: (props) => <QualityProfileCell row={props.row} />,
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
    {
      key: 'lastSearched',
      name: 'Searched',
      minWidth: 140,
      renderCell: (props) => <LastSearchedCell row={props.row} />,
      renderHeaderCell: (props) => (
        <TextFilterHeaderCell
          {...props}
          filterValue={columnFilters.lastSearched}
          onFilterChange={(value) => handleFilterChange('lastSearched', value)}
        />
      )
    },
    {
      key: 'dateImported',
      name: 'Imported',
      minWidth: 140,
      renderCell: (props) => <LastImportedCell row={props.row} />,
      renderHeaderCell: (props) => (
        <TextFilterHeaderCell
          {...props}
          filterValue={columnFilters.dateImported}
          onFilterChange={(value) => handleFilterChange('dateImported', value)}
        />
      )
    },
    {
      key: 'customFormatScore',
      name: 'CF Score',
      minWidth: 90,
      renderCell: (props) => <CFScoreCell row={props.row} />,
      renderHeaderCell: (props) => (
        <NumericFilterHeaderCell
          {...props}
          filterValue={columnFilters.cfScore}
          onFilterChange={(value) => handleFilterChange('cfScore', value)}
        />
      )
    }
  ], [columnFilters, handleFilterChange, filterOptions]);

  return (
    <Card>
      <Flex direction="column" gap="3">
        {/* Header with title and stats */}
        <Flex align="center" justify="between">
          <Heading size="5">Media Library</Heading>
          {mediaData && (
            <Text size="2" color="gray">
              {filteredAndSortedMedia.length} of {mediaData.media.length} items ({selectedMediaIds.size} selected)
              {showAll && ' • Filters disabled'}
            </Text>
          )}
        </Flex>
        <Separator size="4" />

        {/* Instance Selection Section */}
        {!config || !hasAnyInstances ? (
          <Callout.Root color="orange">
            <Callout.Icon>
              <InfoCircledIcon />
            </Callout.Icon>
            <Callout.Text>
              No instances configured. Please add instances in Settings.
            </Callout.Text>
          </Callout.Root>
        ) : (
          <>
            {/* Instance Selector */}
            <Flex gap="3" align="center">
              <Text size="2" weight="medium">Instance:</Text>
              <Select.Root value={selectedInstance || ''} onValueChange={handleInstanceChange}>
                <Select.Trigger style={{ width: '300px' }} placeholder="Choose an instance..." />
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
            </Flex>

            {/* Show All Toggle */}
            {selectedInstance && (
              <Flex align="center" gap="2">
                <Switch
                  checked={showAll}
                  onCheckedChange={handleShowAllChange}
                />
                <Text size="2">Show all media (disable instance filters)</Text>
                <Tooltip content="When enabled, shows all media regardless of monitored status, tags, quality profile, or status filters configured for this instance">
                  <InfoCircledIcon style={{ cursor: 'help' }} />
                </Tooltip>
              </Flex>
            )}
          </>
        )}

        {/* Loading State */}
        {isLoading && (
          <Flex justify="center" p="6">
            <Spinner size="3" />
          </Flex>
        )}

        {/* Error State */}
        {error && !isLoading && (
          <Callout.Root color="red">
            <Callout.Icon>
              <CrossCircledIcon />
            </Callout.Icon>
            <Callout.Text>Failed to load media: {getErrorMessage(error)}</Callout.Text>
          </Callout.Root>
        )}

        {/* No Instance Selected */}
        {!selectedInstance && !isLoading && (
          <Box p="6">
            <Text size="2" color="gray" align="center">
              Select an instance to view media
            </Text>
          </Box>
        )}

        {/* No Media Found */}
        {mediaData && mediaData.media.length === 0 && (
          <Box p="6">
            <Text size="2" color="gray" align="center">
              No media found for this instance
            </Text>
          </Box>
        )}

        {/* DataGrid and Actions */}
        {mediaData && mediaData.media.length > 0 && (
          <>
            {/* DataGrid */}
            <Box style={{ height: '900px' }}>
              <DataGrid
                className="media-library-grid"
                aria-label="Media Library"
                columns={columns}
                rows={filteredAndSortedMedia}
                rowKeyGetter={rowKeyGetter}
                selectedRows={selectedMediaIds}
                onSelectedRowsChange={setSelectedMediaIds}
                sortColumns={sortColumns}
                onSortColumnsChange={setSortColumns}
                rowHeight={48}
                headerRowHeight={68}
                defaultColumnOptions={{
                  sortable: true,
                  resizable: true
                }}
                style={{ height: '100%' }}
              />
            </Box>

            {/* Action Buttons */}
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
