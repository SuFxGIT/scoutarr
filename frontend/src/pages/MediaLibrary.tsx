import { useState, useMemo } from 'react';
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
  Table,
  Checkbox,
  Callout,
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
import { fetchMediaLibrary, triggerManualSearch } from '../services/mediaLibraryService';
import type { MediaLibraryResponse, MediaLibraryItem } from '@scoutarr/shared';
import type { Config } from '../types/config';

const APP_TYPES = ['radarr', 'sonarr', 'lidarr', 'readarr'] as const;
type AppType = typeof APP_TYPES[number];

function MediaLibrary() {
  const [selectedInstance, setSelectedInstance] = useState<string | null>(null);
  const [selectedMediaIds, setSelectedMediaIds] = useState<Set<number>>(new Set());
  const [sortField, setSortField] = useState<'title' | 'lastTriggered'>('title');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

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
      return triggerManualSearch(
        instanceInfo.appType,
        instanceInfo.instanceId,
        Array.from(selectedMediaIds)
      );
    },
    onSuccess: (data) => {
      toast.success(data.message);
      setSelectedMediaIds(new Set()); // Clear selection
      refetch(); // Refresh media list to update last triggered dates
    },
    onError: (error: unknown) => {
      toast.error('Search failed: ' + getErrorMessage(error));
    },
  });

  // Handlers
  const handleInstanceChange = (value: string) => {
    setSelectedInstance(value);
    setSelectedMediaIds(new Set()); // Clear selection when changing instance
  };

  const handleSelectAll = () => {
    if (!mediaData) return;
    if (selectedMediaIds.size === mediaData.media.length) {
      setSelectedMediaIds(new Set());
    } else {
      setSelectedMediaIds(new Set(mediaData.media.map((m: MediaLibraryItem) => m.id)));
    }
  };

  const handleSelectItem = (mediaId: number) => {
    setSelectedMediaIds((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(mediaId)) {
        newSet.delete(mediaId);
      } else {
        newSet.add(mediaId);
      }
      return newSet;
    });
  };

  const handleSort = (field: 'title' | 'lastTriggered') => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const handleManualSearch = async () => {
    if (selectedMediaIds.size === 0) return;
    searchMutation.mutate();
  };

  // Sort media
  const sortedMedia = useMemo(() => {
    if (!mediaData?.media) return [];
    const sorted = [...mediaData.media];
    sorted.sort((a, b) => {
      let comparison = 0;
      if (sortField === 'title') {
        comparison = a.title.localeCompare(b.title);
      } else if (sortField === 'lastTriggered') {
        const aDate = a.lastTriggered ? new Date(a.lastTriggered).getTime() : 0;
        const bDate = b.lastTriggered ? new Date(b.lastTriggered).getTime() : 0;
        comparison = aDate - bDate;
      }
      return sortDirection === 'asc' ? comparison : -comparison;
    });
    return sorted;
  }, [mediaData?.media, sortField, sortDirection]);

  // Check if any instances are configured
  const hasAnyInstances = useMemo(() => {
    if (!config) return false;
    return APP_TYPES.some((appType) => {
      const instances = config.applications[appType];
      return instances && instances.length > 0;
    });
  }, [config]);

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
                {mediaData.media.length} items ({selectedMediaIds.size} selected)
              </Text>
            )}
          </Flex>
          <Separator />

          {isLoading && (
            <Flex justify="center" p="6">
              <Spinner size="3" />
            </Flex>
          )}

          {error && (
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
              <Table.Root variant="surface">
                <Table.Header>
                  <Table.Row>
                    <Table.ColumnHeaderCell style={{ width: '50px' }}>
                      <Checkbox
                        checked={selectedMediaIds.size === mediaData.media.length}
                        onCheckedChange={handleSelectAll}
                      />
                    </Table.ColumnHeaderCell>
                    <Table.ColumnHeaderCell
                      onClick={() => handleSort('title')}
                      style={{ cursor: 'pointer' }}
                    >
                      <Flex align="center" gap="1">
                        Title
                        {sortField === 'title' &&
                          (sortDirection === 'asc' ? <ChevronUpIcon /> : <ChevronDownIcon />)}
                      </Flex>
                    </Table.ColumnHeaderCell>
                    <Table.ColumnHeaderCell>Status</Table.ColumnHeaderCell>
                    <Table.ColumnHeaderCell>Quality Profile</Table.ColumnHeaderCell>
                    <Table.ColumnHeaderCell>Monitored</Table.ColumnHeaderCell>
                    <Table.ColumnHeaderCell
                      onClick={() => handleSort('lastTriggered')}
                      style={{ cursor: 'pointer' }}
                    >
                      <Flex align="center" gap="1">
                        Last Triggered
                        {sortField === 'lastTriggered' &&
                          (sortDirection === 'asc' ? <ChevronUpIcon /> : <ChevronDownIcon />)}
                      </Flex>
                    </Table.ColumnHeaderCell>
                  </Table.Row>
                </Table.Header>

                <Table.Body>
                  {sortedMedia.map((item: MediaLibraryItem) => (
                    <Table.Row key={item.id}>
                      <Table.Cell>
                        <Checkbox
                          checked={selectedMediaIds.has(item.id)}
                          onCheckedChange={() => handleSelectItem(item.id)}
                        />
                      </Table.Cell>
                      <Table.Cell>{item.title}</Table.Cell>
                      <Table.Cell>
                        <Badge size="1" variant="soft">
                          {item.status}
                        </Badge>
                      </Table.Cell>
                      <Table.Cell>
                        <Text size="2">{item.qualityProfileName || 'N/A'}</Text>
                      </Table.Cell>
                      <Table.Cell>
                        <Badge size="1" color={item.monitored ? 'green' : 'gray'}>
                          {item.monitored ? 'Yes' : 'No'}
                        </Badge>
                      </Table.Cell>
                      <Table.Cell>
                        <Text size="2" color="gray">
                          {item.lastTriggered ? format(new Date(item.lastTriggered), 'PPp') : 'Never'}
                        </Text>
                      </Table.Cell>
                    </Table.Row>
                  ))}
                </Table.Body>
              </Table.Root>

              {/* Manual Search Button */}
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
    </Flex>
  );
}

export default MediaLibrary;
