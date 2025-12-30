import { useState, useMemo, useCallback, useEffect } from 'react';
import { useSearchParams, useLocation } from 'react-router-dom';
import DataGrid, { Column, SelectColumn, SortColumn } from 'react-data-grid';
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
import { format } from 'date-fns';
import { toast } from 'sonner';
import axios from 'axios';
import { formatAppName, getErrorMessage } from '../utils/helpers';
import { AppIcon } from '../components/icons/AppIcon';
import { fetchMediaLibrary, searchMedia } from '../services/mediaLibraryService';
import { useNavigation } from '../contexts/NavigationContext';
import type { MediaLibraryResponse, MediaLibraryItem } from '@scoutarr/shared';
import type { Config } from '../types/config';

const APP_TYPES = ['radarr', 'sonarr', 'lidarr', 'readarr'] as const;
type AppType = typeof APP_TYPES[number];

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
  row: MediaLibraryItem & {
    formattedLastSearched: string;
    formattedDateImported: string;
  };
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
        style={{
          flex: 1,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
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

function MediaLibrary() {
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
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isSyncing, setIsSyncing] = useState(false);
  const showAllParam = searchParams.get('showAll');
  const [showAll, setShowAll] = useState<boolean>(showAllParam === 'true');

  // Update lastLibraryUrl whenever the location changes
  useEffect(() => {
    setLastLibraryUrl(location.pathname + location.search);
  }, [location.pathname, location.search, setLastLibraryUrl]);

  // Fetch config to get instances
  const { data: config } = useQuery<Config>({
    queryKey: ['config'],
    queryFn: async () => {
      const response = await axios.get('/api/config');
      return response.data;
    },
    enabled: true,
    staleTime: Infinity,
  });

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

  const handleSync = useCallback(async () => {
    if (!instanceInfo) return;
    setIsSyncing(true);
    try {
      await axios.post(`/api/sync/${instanceInfo.appType}/${instanceInfo.instanceId}`);
      toast.success('Sync completed');
      refetch(); // Refresh media list
    } catch (error: unknown) {
      toast.error('Sync failed: ' + getErrorMessage(error));
    } finally {
      setIsSyncing(false);
    }
  }, [instanceInfo, refetch]);

  // Filter and sort media, pre-compute formatted dates
  const filteredAndSortedMedia = useMemo(() => {
    if (!mediaData?.media) return [];

    // Filter media based on search query
    let filtered = mediaData.media;
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = mediaData.media.filter(item => {
        // Search in title
        if (item.title.toLowerCase().includes(query)) return true;

        // Search in status
        if (item.status.toLowerCase().includes(query)) return true;

        // Search in quality profile
        if (item.qualityProfileName?.toLowerCase().includes(query)) return true;

        // Search in formatted last searched date
        if (item.lastSearched) {
          const formattedDate = format(new Date(item.lastSearched), 'PPp').toLowerCase();
          if (formattedDate.includes(query)) return true;
        }

        // Search in formatted date imported
        if (item.dateImported) {
          const formattedDate = format(new Date(item.dateImported), 'PPp').toLowerCase();
          if (formattedDate.includes(query)) return true;
        }

        return false;
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
          const aDate = a.lastSearched ? new Date(a.lastSearched).getTime() : 0;
          const bDate = b.lastSearched ? new Date(b.lastSearched).getTime() : 0;
          comparison = aDate - bDate;
        } else if (columnKey === 'dateImported') {
          const aDate = a.dateImported ? new Date(a.dateImported).getTime() : 0;
          const bDate = b.dateImported ? new Date(b.dateImported).getTime() : 0;
          comparison = aDate - bDate;
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
      formattedDateImported: item.dateImported ? format(new Date(item.dateImported), 'PPp') : 'N/A'
    }));
  }, [mediaData?.media, sortColumns, searchQuery]);

  // Check if any instances are configured
  const hasAnyInstances = useMemo(() => {
    if (!config) return false;
    return APP_TYPES.some((appType) => {
      const instances = config.applications[appType];
      return instances && instances.length > 0;
    });
  }, [config]);

  // Column configuration for DataGrid
  const columns: readonly Column<MediaLibraryItem & {
    formattedLastSearched: string;
    formattedDateImported: string;
  }>[] = useMemo(() => [
    SelectColumn,
    {
      key: 'title',
      name: 'Title',
      sortable: true,
      resizable: true,
      renderCell: (props) => <TitleCell row={props.row} />
    },
    {
      key: 'qualityProfileName',
      name: 'Quality Profile',
      sortable: true,
      resizable: true,
      renderCell: (props) => <QualityProfileCell row={props.row} />
    },
    {
      key: 'lastSearched',
      name: 'Last Searched',
      sortable: true,
      resizable: true,
      renderCell: (props) => <LastSearchedCell row={props.row} />
    },
    {
      key: 'dateImported',
      name: 'Last Imported',
      sortable: true,
      resizable: true,
      renderCell: (props) => <LastImportedCell row={props.row} />
    },
    {
      key: 'customFormatScore',
      name: 'CF Score',
      sortable: true,
      resizable: true,
      renderCell: (props) => <CFScoreCell row={props.row} />
    }
  ], []);

  return (
    <Flex direction="column" gap="4">
      {/* Instance Selector Card */}
      <Card>
        <Flex direction="column" gap="3">
          <Heading size="5">Select Instance</Heading>
          <Separator />

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
          )}
        </Flex>
      </Card>

      {/* Media Table Card */}
      <Card>
        <Flex direction="column" gap="3">
          <Flex align="center" justify="between">
            <Heading size="5">Media Library</Heading>
            {mediaData && (
              <Text size="2" color="gray">
                {filteredAndSortedMedia.length} of {mediaData.media.length} items ({selectedMediaIds.size} selected)
                {showAll && ' • Filters disabled'}
              </Text>
            )}
          </Flex>
          <Separator />

          {/* Show All Media Toggle */}
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

          {/* Search Bar */}
          {mediaData && mediaData.media.length > 0 && (
            <TextField.Root
              placeholder="Search by title, status, quality profile, last searched, or date imported..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              size="2"
            >
              <TextField.Slot>
                <MagnifyingGlassIcon height="16" width="16" />
              </TextField.Slot>
            </TextField.Root>
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
                Select an instance to view media
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
              {/* DataGrid */}
              <Box style={{ height: '900px' }}>
                <DataGrid
                  className="media-library-grid"
                  columns={columns}
                  rows={filteredAndSortedMedia}
                  rowKeyGetter={(row) => row.id}
                  selectedRows={selectedMediaIds}
                  onSelectedRowsChange={setSelectedMediaIds}
                  sortColumns={sortColumns}
                  onSortColumnsChange={setSortColumns}
                  rowHeight={55}
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
                  onClick={handleSync}
                  disabled={isSyncing || !selectedInstance}
                >
                  {isSyncing ? (
                    <>
                      <Spinner size="1" />
                      Syncing...
                    </>
                  ) : (
                    'Sync Now'
                  )}
                </Button>
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
    </Flex>
  );
}

export default MediaLibrary;
