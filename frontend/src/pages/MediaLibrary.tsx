import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { useSearchParams, useLocation } from 'react-router-dom';
import { useVirtualizer } from '@tanstack/react-virtual';
import {
  Flex,
  Heading,
  Button,
  Card,
  Text,
  Badge,
  Separator,
  Spinner,
  Box,
  Select,
  Checkbox,
  Callout,
  TextField,
} from '@radix-ui/themes';
import {
  ChevronUpIcon,
  ChevronDownIcon,
  MagnifyingGlassIcon,
  InfoCircledIcon,
  CrossCircledIcon,
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

function MediaLibrary() {
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const { setLastLibraryUrl } = useNavigation();

  // Get initial instance from URL or use null
  const initialInstance = searchParams.get('instance');
  const [selectedInstance, setSelectedInstance] = useState<string | null>(initialInstance);
  const [selectedMediaIds, setSelectedMediaIds] = useState<Set<number>>(new Set());
  const [sortField, setSortField] = useState<'title' | 'status' | 'qualityProfileName' | 'monitored' | 'lastSearched' | 'dateImported' | 'customFormatScore' | 'hasFile'>('title');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isSyncing, setIsSyncing] = useState(false);

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
    queryKey: ['mediaLibrary', selectedInstance],
    queryFn: async () => {
      if (!instanceInfo) return { media: [], total: 0, instanceName: '', appType: '' };
      return fetchMediaLibrary(instanceInfo.appType, instanceInfo.instanceId);
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
    // Update URL to persist instance selection
    setSearchParams({ instance: value });
  };

  const handleSelectAll = useCallback(() => {
    if (!mediaData) return;
    if (selectedMediaIds.size === mediaData.media.length) {
      setSelectedMediaIds(new Set());
    } else {
      setSelectedMediaIds(new Set(mediaData.media.map((m: MediaLibraryItem) => m.id)));
    }
  }, [mediaData, selectedMediaIds.size]);

  const handleSelectItem = useCallback((mediaId: number) => {
    setSelectedMediaIds((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(mediaId)) {
        newSet.delete(mediaId);
      } else {
        newSet.add(mediaId);
      }
      return newSet;
    });
  }, []);

  const handleSort = useCallback((field: 'title' | 'status' | 'qualityProfileName' | 'monitored' | 'lastSearched' | 'dateImported' | 'customFormatScore' | 'hasFile') => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  }, [sortField]);

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

    // Sort filtered results
    const sorted = [...filtered];
    sorted.sort((a, b) => {
      let comparison = 0;
      if (sortField === 'title') {
        comparison = a.title.localeCompare(b.title);
      } else if (sortField === 'status') {
        comparison = a.status.localeCompare(b.status);
      } else if (sortField === 'qualityProfileName') {
        const aProfile = a.qualityProfileName || '';
        const bProfile = b.qualityProfileName || '';
        comparison = aProfile.localeCompare(bProfile);
      } else if (sortField === 'monitored') {
        comparison = (a.monitored === b.monitored) ? 0 : a.monitored ? -1 : 1;
      } else if (sortField === 'lastSearched') {
        const aDate = a.lastSearched ? new Date(a.lastSearched).getTime() : 0;
        const bDate = b.lastSearched ? new Date(b.lastSearched).getTime() : 0;
        comparison = aDate - bDate;
      } else if (sortField === 'dateImported') {
        const aDate = a.dateImported ? new Date(a.dateImported).getTime() : 0;
        const bDate = b.dateImported ? new Date(b.dateImported).getTime() : 0;
        comparison = aDate - bDate;
      } else if (sortField === 'customFormatScore') {
        const aScore = a.customFormatScore ?? -Infinity;
        const bScore = b.customFormatScore ?? -Infinity;
        comparison = aScore - bScore;
      } else if (sortField === 'hasFile') {
        comparison = (a.hasFile === b.hasFile) ? 0 : a.hasFile ? -1 : 1;
      }
      return sortDirection === 'asc' ? comparison : -comparison;
    });

    // Pre-compute formatted dates to avoid formatting on every render
    return sorted.map(item => ({
      ...item,
      formattedLastSearched: item.lastSearched ? format(new Date(item.lastSearched), 'PPp') : 'Never',
      formattedDateImported: item.dateImported ? format(new Date(item.dateImported), 'PPp') : 'N/A'
    }));
  }, [mediaData?.media, sortField, sortDirection, searchQuery]);

  // Check if any instances are configured
  const hasAnyInstances = useMemo(() => {
    if (!config) return false;
    return APP_TYPES.some((appType) => {
      const instances = config.applications[appType];
      return instances && instances.length > 0;
    });
  }, [config]);

  // Virtual scrolling setup
  const parentRef = useRef<HTMLDivElement>(null);
  const rowVirtualizer = useVirtualizer({
    count: filteredAndSortedMedia.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 50, // Estimated row height
    overscan: 5, // Render 5 extra items above and below viewport
  });

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
              </Text>
            )}
          </Flex>
          <Separator />

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
              {/* Virtual Table Container */}
              <Box style={{ overflow: 'auto', maxHeight: '600px' }} ref={parentRef}>
                {/* Table Header - Fixed */}
                <Flex
                  style={{
                    position: 'sticky',
                    top: 0,
                    zIndex: 1,
                    backgroundColor: 'var(--color-panel)',
                    borderBottom: '1px solid var(--gray-6)',
                  }}
                  p="2"
                  gap="2"
                >
                  <Box style={{ width: '50px', flexShrink: 0 }}>
                    <Checkbox
                      checked={selectedMediaIds.size === mediaData.media.length}
                      onCheckedChange={handleSelectAll}
                    />
                  </Box>
                  <Box
                    style={{ flex: '2', cursor: 'pointer', fontWeight: 500 }}
                    onClick={() => handleSort('title')}
                  >
                    <Flex align="center" gap="1">
                      Title
                      {sortField === 'title' &&
                        (sortDirection === 'asc' ? <ChevronUpIcon /> : <ChevronDownIcon />)}
                    </Flex>
                  </Box>
                  <Box
                    style={{ flex: '1', cursor: 'pointer', fontWeight: 500 }}
                    onClick={() => handleSort('status')}
                  >
                    <Flex align="center" gap="1">
                      Status
                      {sortField === 'status' &&
                        (sortDirection === 'asc' ? <ChevronUpIcon /> : <ChevronDownIcon />)}
                    </Flex>
                  </Box>
                  <Box
                    style={{ flex: '1.3', cursor: 'pointer', fontWeight: 500 }}
                    onClick={() => handleSort('qualityProfileName')}
                  >
                    <Flex align="center" gap="1">
                      Quality Profile
                      {sortField === 'qualityProfileName' &&
                        (sortDirection === 'asc' ? <ChevronUpIcon /> : <ChevronDownIcon />)}
                    </Flex>
                  </Box>
                  <Box
                    style={{ flex: '0.7', cursor: 'pointer', fontWeight: 500 }}
                    onClick={() => handleSort('monitored')}
                  >
                    <Flex align="center" gap="1">
                      Monitored
                      {sortField === 'monitored' &&
                        (sortDirection === 'asc' ? <ChevronUpIcon /> : <ChevronDownIcon />)}
                    </Flex>
                  </Box>
                  <Box
                    style={{ flex: '1.3', cursor: 'pointer', fontWeight: 500 }}
                    onClick={() => handleSort('lastSearched')}
                  >
                    <Flex align="center" gap="1">
                      Last Searched
                      {sortField === 'lastSearched' &&
                        (sortDirection === 'asc' ? <ChevronUpIcon /> : <ChevronDownIcon />)}
                    </Flex>
                  </Box>
                  <Box
                    style={{ flex: '1.3', cursor: 'pointer', fontWeight: 500 }}
                    onClick={() => handleSort('dateImported')}
                  >
                    <Flex align="center" gap="1">
                      Date Imported
                      {sortField === 'dateImported' &&
                        (sortDirection === 'asc' ? <ChevronUpIcon /> : <ChevronDownIcon />)}
                    </Flex>
                  </Box>
                  <Box
                    style={{ flex: '0.6', cursor: 'pointer', fontWeight: 500 }}
                    onClick={() => handleSort('customFormatScore')}
                  >
                    <Flex align="center" gap="1">
                      CF Score
                      {sortField === 'customFormatScore' &&
                        (sortDirection === 'asc' ? <ChevronUpIcon /> : <ChevronDownIcon />)}
                    </Flex>
                  </Box>
                  <Box
                    style={{ flex: '0.5', cursor: 'pointer', fontWeight: 500 }}
                    onClick={() => handleSort('hasFile')}
                  >
                    <Flex align="center" gap="1">
                      File
                      {sortField === 'hasFile' &&
                        (sortDirection === 'asc' ? <ChevronUpIcon /> : <ChevronDownIcon />)}
                    </Flex>
                  </Box>
                </Flex>

                {/* Virtualized Table Body */}
                <div
                  style={{
                    height: `${rowVirtualizer.getTotalSize()}px`,
                    width: '100%',
                    position: 'relative',
                  }}
                >
                  {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                    const item = filteredAndSortedMedia[virtualRow.index];
                    return (
                      <Flex
                        key={item.id}
                        style={{
                          position: 'absolute',
                          top: 0,
                          left: 0,
                          width: '100%',
                          height: `${virtualRow.size}px`,
                          transform: `translateY(${virtualRow.start}px)`,
                          borderBottom: '1px solid var(--gray-4)',
                        }}
                        p="2"
                        gap="2"
                        align="center"
                      >
                        <Box style={{ width: '50px', flexShrink: 0 }}>
                          <Checkbox
                            checked={selectedMediaIds.has(item.id)}
                            onCheckedChange={() => handleSelectItem(item.id)}
                          />
                        </Box>
                        <Box style={{ flex: '2' }}>
                          <Text size="2">{item.title}</Text>
                        </Box>
                        <Box style={{ flex: '1' }}>
                          <Badge size="1" variant="soft">
                            {item.status}
                          </Badge>
                        </Box>
                        <Box style={{ flex: '1.3' }}>
                          <Text size="2">{item.qualityProfileName || 'N/A'}</Text>
                        </Box>
                        <Box style={{ flex: '0.7' }}>
                          <Badge size="1" color={item.monitored ? 'green' : 'gray'}>
                            {item.monitored ? 'Yes' : 'No'}
                          </Badge>
                        </Box>
                        <Box style={{ flex: '1.3' }}>
                          <Text size="2" color="gray">
                            {item.formattedLastSearched}
                          </Text>
                        </Box>
                        <Box style={{ flex: '1.3' }}>
                          <Text size="2" color="gray">
                            {item.formattedDateImported}
                          </Text>
                        </Box>
                        <Box style={{ flex: '0.6' }}>
                          <Text size="2">
                            {item.customFormatScore ?? '-'}
                          </Text>
                        </Box>
                        <Box style={{ flex: '0.5' }}>
                          {item.hasFile ? (
                            <Badge size="1" color="green">✓</Badge>
                          ) : (
                            <Text size="1" color="gray">-</Text>
                          )}
                        </Box>
                      </Flex>
                    );
                  })}
                </div>
              </Box>

              {/* Manual Search Button */}
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
