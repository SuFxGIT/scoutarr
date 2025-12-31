import { useState, useRef, useEffect } from 'react';
import {
  Flex,
  Heading,
  Button,
  Card,
  Text,
  Badge,
  Separator,
  Dialog,
  Tooltip,
  Spinner,
  Box,
  Select,
} from '@radix-ui/themes';
import { PlayIcon, ChevronLeftIcon, ChevronRightIcon, TrashIcon, ReloadIcon, QuestionMarkCircledIcon } from '@radix-ui/react-icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import humanizeDuration from 'humanize-duration';
import { toast } from 'sonner';
import axios from 'axios';
import { formatAppName, getErrorMessage } from '../utils/helpers';
import { ITEMS_PER_PAGE, LOG_CONTAINER_HEIGHT, LOG_BG_COLOR, LOG_SCROLL_THRESHOLD } from '../utils/constants';
import { AppIcon } from '../components/icons/AppIcon';
import type { SearchResults, Stats, SchedulerHistoryEntry } from '../types/api';
import type { Config } from '../types/config';

function Dashboard() {
  const queryClient = useQueryClient();
  const [currentPage, setCurrentPage] = useState(1);
  const logContainerRef = useRef<HTMLDivElement>(null);
  const [confirmingClear, setConfirmingClear] = useState<'stats' | 'recent' | null>(null);
  const [selectedSearch, setSelectedSearch] = useState<Stats['recentSearches'][number] | null>(null);
  const [dateFilter, setDateFilter] = useState<'all' | 'today' | 'week' | 'month'>('all');

  // Fetch config to get instance names
  const { data: config } = useQuery<Config>({
    queryKey: ['config'],
    queryFn: async () => {
      const response = await axios.get('/api/config');
      return response.data;
    },
    enabled: true,
    staleTime: Infinity,
  });

  // Fetch scheduler status only (without connection checks)
  const { data: schedulerStatus } = useQuery<{
    enabled: boolean;
    globalEnabled: boolean;
    running: boolean;
    schedule: string | null;
    nextRun: string | null;
    instances: Record<string, { schedule: string; nextRun: string | null; running: boolean }>;
  }>({
    queryKey: ['schedulerStatus'],
    queryFn: async () => {
      const response = await axios.get('/api/status/scheduler');
      return response.data;
    },
    enabled: true,
    staleTime: Infinity,
  });

  // Fetch scheduler history - load from database on mount
  // History is persisted in the backend, so we should load it on mount
  const { data: schedulerHistory = [], refetch: refetchHistory } = useQuery<SchedulerHistoryEntry[]>({
    queryKey: ['schedulerHistory'],
    queryFn: async () => {
      const response = await axios.get('/api/status/scheduler/history');
      return response.data;
    },
    enabled: true, // Fetch on mount to load cached history from database
    staleTime: Infinity, // History never goes stale - it only changes when runs happen
  });

  // Fetch stats - load from database on mount
  // Stats are persisted in the backend database, so we should load them on mount
  const { data: stats, refetch: refetchStats } = useQuery<Stats>({
    queryKey: ['stats'],
    queryFn: async () => {
      const response = await axios.get('/api/stats');
      return response.data;
    },
    enabled: true, // Fetch on mount to load cached stats from database
    staleTime: Infinity, // Stats never go stale - they only change when a run happens
  });

  // Auto-scroll to bottom when scheduler history changes
  useEffect(() => {
    if (logContainerRef.current && schedulerHistory.length > 0) {
      const container = logContainerRef.current;
      const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < LOG_SCROLL_THRESHOLD;

      if (isNearBottom) {
        container.scrollTop = container.scrollHeight;
      }
    }
  }, [schedulerHistory]);

  // Mutation for running search
  const runSearchMutation = useMutation({
    mutationFn: async () => {
      await axios.post('/api/search/run');
    },
    onSuccess: () => {
      toast.success('Search run completed');
      refetchStats();
      refetchHistory();
    },
    onError: (error: unknown) => {
      toast.error('Search failed: ' + getErrorMessage(error));
    },
  });

  // Mutation for clearing recent searches
  const clearRecentMutation = useMutation({
    mutationFn: async () => {
      await axios.post('/api/stats/clear-recent');
    },
    onSuccess: () => {
      toast.success('Recent searches cleared');
      setCurrentPage(1);
      setConfirmingClear(null);
      refetchStats();
    },
    onError: (error: unknown) => {
      toast.error('Failed to clear recent searches: ' + getErrorMessage(error));
      setConfirmingClear(null);
    },
  });

  // Mutation for clearing stats
  const clearStatsMutation = useMutation({
    mutationFn: async () => {
      await axios.post('/api/stats/clear-data');
    },
    onSuccess: () => {
      toast.success('Recent searches and stats cleared');
      setCurrentPage(1);
      setConfirmingClear(null);
      refetchStats();
    },
    onError: (error: unknown) => {
      toast.error('Failed to clear data: ' + getErrorMessage(error));
      setConfirmingClear(null);
    },
  });

  // Mutation for clearing scheduler history
  const clearHistoryMutation = useMutation({
    mutationFn: async () => {
      await axios.post('/api/status/scheduler/history/clear');
    },
    onSuccess: () => {
      // Optimistically update the query cache instead of refetching
      queryClient.setQueryData(['schedulerHistory'], []);
      toast.success('Scheduler history cleared');
    },
    onError: (error: unknown) => {
      toast.error('Failed to clear history: ' + getErrorMessage(error));
      // Only refetch on error to get the actual state
      refetchHistory();
    },
  });

  // Render confirmation buttons for clear actions
  const renderConfirmButtons = (type: 'stats' | 'recent', onConfirm: () => void) => {
    if (confirmingClear !== type) return null;

    const isPending = (type === 'stats' && clearStatsMutation.isPending) ||
                      (type === 'recent' && clearRecentMutation.isPending);

    return (
      <Flex gap="2" align="center">
        <Text size="2" color="gray">Are you sure?</Text>
        <Button
          variant="solid"
          color="red"
          size="2"
          onClick={onConfirm}
          disabled={isPending}
        >
          {isPending ? (
            <>
              <Spinner size="1" /> Clearing...
            </>
          ) : (
            'Confirm'
          )}
        </Button>
        <Button
          variant="outline"
          size="2"
          onClick={() => setConfirmingClear(null)}
          disabled={isPending}
        >
          Cancel
        </Button>
      </Flex>
    );
  };

  // Convert scheduler history to log format using date-fns and humanize-duration
  const convertHistoryToLogs = (
    history: SchedulerHistoryEntry[], 
    nextRun: string | null, 
    schedulerEnabled: boolean, 
    instanceSchedules?: Record<string, { schedule: string; nextRun: string | null; running: boolean }>
  ): Array<{ timestamp: string; app: string; message: string; type: 'success' | 'error' | 'info' }> => {
    const logs: Array<{ timestamp: string; app: string; message: string; type: 'success' | 'error' | 'info' }> = [];
    
    // Add global scheduler next run time if global scheduler is enabled
    if (schedulerEnabled && nextRun) {
      const nextRunDate = new Date(nextRun);
      const now = new Date();
      const timeUntilNext = nextRunDate.getTime() - now.getTime();
      
      const timeString = humanizeDuration(timeUntilNext, {
        round: true,
        largest: 2,
        units: ['d', 'h', 'm'],
        conjunction: ' and ',
        serialComma: false,
      }) || 'less than a minute';
      
      logs.push({
        timestamp: format(now, 'HH:mm:ss'),
        app: 'Scheduler',
        message: `Next run (Global): ${format(nextRunDate, 'PPpp')} (in ${timeString})`,
        type: 'info'
      });
    }

    // Add per-instance next run times
    if (instanceSchedules && Object.keys(instanceSchedules).length > 0) {
      const now = new Date();
      Object.entries(instanceSchedules).forEach(([instanceKey, instanceStatus]) => {
        if (instanceStatus.nextRun) {
          const nextRunDate = new Date(instanceStatus.nextRun);
          const timeUntilNext = nextRunDate.getTime() - now.getTime();
          
          const timeString = humanizeDuration(timeUntilNext, {
            round: true,
            largest: 2,
            units: ['d', 'h', 'm'],
            conjunction: ' and ',
            serialComma: false,
          }) || 'less than a minute';
          
          // Get instance name from config if available, fallback to formatted key
          let instanceName = formatAppName(instanceKey);
          if (config) {
            const [appType, instanceId] = instanceKey.split('-');
            const appConfigs = config.applications[appType as 'radarr' | 'sonarr' | 'lidarr' | 'readarr'];
            if (Array.isArray(appConfigs)) {
              const instance = appConfigs.find(inst => inst.id === instanceId);
              if (instance?.name) {
                instanceName = instance.name;
              }
            }
          }
          
          logs.push({
            timestamp: format(now, 'HH:mm:ss'),
            app: instanceKey,
            message: `Next run (${instanceName}): ${format(nextRunDate, 'PPpp')} (in ${timeString})`,
            type: 'info'
          });
        }
      });
    }
    
    history.forEach(entry => {
      const timestamp = format(new Date(entry.timestamp), 'HH:mm:ss');
      
      if (entry.success) {
        Object.entries(entry.results as SearchResults).forEach(([app, result]) => {
          if (result.success) {
            const appName = result.instanceName || formatAppName(app);
            const searched = result.searched || 0;
            
            // Determine media type
            const mediaType = result.movies ? 'movies' : result.artists ? 'artists' : result.authors ? 'authors' : 'series';
            
            // Show searched action
            logs.push({
              timestamp,
              app,
              message: `${appName}: Searched ${searched} ${mediaType}`,
              type: 'success'
            });
            
            // Show searched items (check all possible media type keys)
            const items = result.movies || result.series || result.artists || result.authors || [];
            if (items.length > 0) {
              items.forEach((item: { id: number; title: string }) => {
                const itemLabel = mediaType === 'movies' ? 'Movie' : mediaType === 'artists' ? 'Artist' : mediaType === 'authors' ? 'Author' : 'Series';
                logs.push({
                  timestamp,
                  app,
                  message: `  → ${itemLabel}: ${item.title}`,
                  type: 'info'
                });
              });
            }
          } else {
            const appName = result.instanceName || formatAppName(app);
            logs.push({
              timestamp,
              app,
              message: `${appName}: Error - ${result.error || 'Unknown error'}`,
              type: 'error'
            });
          }
        });
      } else {
        logs.push({
          timestamp,
          app: 'Scheduler',
          message: `Error: ${entry.error || 'Unknown error'}`,
          type: 'error'
        });
      }
    });
    
    return logs;
  };


  const renderAutomaticRunPreview = () => {
    const scheduler = schedulerStatus || null;
    const logs = convertHistoryToLogs(
      schedulerHistory, 
      scheduler?.nextRun || null, 
      scheduler?.globalEnabled || false, 
      scheduler?.instances
    );

    return (
      <Card>
        <Flex direction="column" gap="3">
          <Flex align="center" justify="between">
            <Flex align="center" gap="2">
              <Heading size="5">Logs</Heading>
              {schedulerStatus && 'enabled' in schedulerStatus && (
                <Badge
                  color={
                    schedulerStatus.enabled && schedulerStatus.running
                      ? 'green'
                      : schedulerStatus.enabled
                      ? 'yellow'
                      : 'gray'
                  }
                  size="2"
                >
                  Scheduler: {schedulerStatus.enabled && schedulerStatus.running ? 'Running' : schedulerStatus.enabled ? 'Enabled' : 'Disabled'}
                </Badge>
              )}
              <Tooltip content="Refresh the page to update scheduler status and logs.">
                <QuestionMarkCircledIcon style={{ color: 'var(--gray-9)', cursor: 'help' }} />
              </Tooltip>
            </Flex>
            <Flex gap="3">
              <Tooltip content="Refresh the page to update scheduler status and logs.">
                <Button
                  size="2"
                  variant="outline"
                  onClick={() => window.location.reload()}
                >
                  <ReloadIcon /> Refresh
                </Button>
              </Tooltip>
              <Tooltip content="Start a search run immediately using the current configuration.">
                <span>
                  <Button
                    size="2"
                    onClick={() => runSearchMutation.mutate()}
                    disabled={runSearchMutation.isPending}
                  >
                    <PlayIcon /> {runSearchMutation.isPending ? 'Running...' : 'Manually Run Now'}
                  </Button>
                </span>
              </Tooltip>
              <Tooltip content="Clear log history.">
                <span>
                  <Button
                    variant="outline"
                    size="2"
                    onClick={() => clearHistoryMutation.mutate()}
                    disabled={clearHistoryMutation.isPending}
                  >
                    <TrashIcon />
                  </Button>
                </span>
              </Tooltip>
            </Flex>
          </Flex>
          <Separator />
          <Card variant="surface" style={{ backgroundColor: LOG_BG_COLOR, fontFamily: 'monospace' }}>
          <div
            ref={logContainerRef}
            style={{
              height: LOG_CONTAINER_HEIGHT,
              overflowY: 'auto',
              padding: '1rem',
              fontSize: '0.875rem',
              lineHeight: '1.5'
            }}
          >
            {logs.length === 0 ? (
              <Text size="2" color="gray" style={{ fontStyle: 'italic' }}>
                No scheduler runs yet. The scheduler will automatically run searches based on the schedule.
              </Text>
            ) : (
              logs.map((log, idx) => (
                <div key={idx} style={{ marginBottom: '0.25rem' }}>
                  <Flex align="center" gap="1" wrap="wrap">
                    <Text 
                      size="2" 
                      style={{ 
                        color: log.type === 'error' ? 'var(--red-9)' : log.type === 'success' ? 'var(--green-9)' : 'var(--gray-9)',
                      }}
                    >
                      [{log.timestamp}]
                    </Text>
                    <AppIcon app={log.app} size={12} variant="light" />
                    <Text 
                      size="2" 
                      style={{ 
                        color: log.type === 'error' ? 'var(--red-9)' : log.type === 'success' ? 'var(--green-9)' : 'var(--gray-9)',
                        whiteSpace: 'pre-wrap'
                      }}
                    >
                      {formatAppName(log.app)}: {log.message}
                    </Text>
                  </Flex>
                </div>
              ))
            )}
          </div>
        </Card>
        </Flex>
      </Card>
    );
  };

  return (
    <Box width="100%" pt="0" mt="0">
      <Flex direction="column" gap="3">
        {renderAutomaticRunPreview()}

        {stats && (() => {
          // Calculate totals for all app types
          let lidarrTotal = 0;
          let radarrTotal = 0;
          let sonarrTotal = 0;
          let readarrTotal = 0;
          
          Object.entries(stats.searchesByInstance || {}).forEach(([instanceKey, count]) => {
            if (instanceKey.startsWith('lidarr')) {
              lidarrTotal += count as number;
            } else if (instanceKey.startsWith('radarr')) {
              radarrTotal += count as number;
            } else if (instanceKey.startsWith('sonarr')) {
              sonarrTotal += count as number;
            } else if (instanceKey.startsWith('readarr')) {
              readarrTotal += count as number;
            }
          });
          
          // Fallback to searchesByApplication if searchesByInstance is empty
          if (lidarrTotal === 0 && radarrTotal === 0 && sonarrTotal === 0 && readarrTotal === 0) {
            lidarrTotal = stats.searchesByApplication?.lidarr || 0;
            radarrTotal = stats.searchesByApplication?.radarr || 0;
            sonarrTotal = stats.searchesByApplication?.sonarr || 0;
            readarrTotal = stats.searchesByApplication?.readarr || 0;
          }
          
          return (
            <Card>
              <Flex direction="column" gap="3">
                <Flex align="center" justify="between">
                  <Heading size="5">Statistics</Heading>
                  <Tooltip content="Delete all search history and tagged media records from the database. This will reset all statistics to zero.">
                    <span>
                      {renderConfirmButtons('stats', () => clearStatsMutation.mutate()) || (
                        <Button 
                          variant="outline" 
                          color="red"
                          size="2" 
                          onClick={() => setConfirmingClear('stats')}
                        >
                          Clear Data
                        </Button>
                      )}
                    </span>
                  </Tooltip>
                </Flex>
                <Separator />
                <Flex gap="3" wrap="wrap" justify="center">
                  <Card variant="surface" style={{ flex: '1 1 200px', minWidth: '150px' }}>
                    <Flex direction="column" gap="2" align="center" justify="center">
                      <Flex align="center" gap="2">
                        <AppIcon app="lidarr" size={20} variant="light" />
                        <Text size="2" color="gray" align="center">Lidarr</Text>
                      </Flex>
                      <Heading size="7" align="center">{lidarrTotal}</Heading>
                    </Flex>
                  </Card>
                  <Card variant="surface" style={{ flex: '1 1 200px', minWidth: '150px' }}>
                    <Flex direction="column" gap="2" align="center" justify="center">
                      <Flex align="center" gap="2">
                        <AppIcon app="radarr" size={20} variant="light" />
                        <Text size="2" color="gray" align="center">Radarr</Text>
                      </Flex>
                      <Heading size="7" align="center">{radarrTotal}</Heading>
                    </Flex>
                  </Card>
                  <Card variant="surface" style={{ flex: '1 1 200px', minWidth: '150px' }}>
                    <Flex direction="column" gap="2" align="center" justify="center">
                      <Text size="2" color="gray" align="center">Total Searched</Text>
                      <Heading size="7" align="center">{stats.totalSearches}</Heading>
                    </Flex>
                  </Card>
                  <Card variant="surface" style={{ flex: '1 1 200px', minWidth: '150px' }}>
                    <Flex direction="column" gap="2" align="center" justify="center">
                      <Flex align="center" gap="2">
                        <AppIcon app="sonarr" size={20} variant="light" />
                        <Text size="2" color="gray" align="center">Sonarr</Text>
                      </Flex>
                      <Heading size="7" align="center">{sonarrTotal}</Heading>
                    </Flex>
                  </Card>
                  <Card variant="surface" style={{ flex: '1 1 200px', minWidth: '150px' }}>
                    <Flex direction="column" gap="2" align="center" justify="center">
                      <Flex align="center" gap="2">
                        <AppIcon app="readarr" size={20} variant="light" />
                        <Text size="2" color="gray" align="center">Readarr</Text>
                      </Flex>
                      <Heading size="7" align="center">{readarrTotal}</Heading>
                    </Flex>
                  </Card>
                </Flex>
                {stats.lastSearch && (
                  <Text size="2" color="gray">
                    Last search: {format(new Date(stats.lastSearch), 'PPpp')}
                  </Text>
                )}
              </Flex>
            </Card>
          );
        })()}

        {stats && (() => {
          const allSearches = stats.recentSearches || [];

          // Filter by date
          const now = new Date();
          const filteredSearches = allSearches.filter(search => {
            const searchDate = new Date(search.timestamp);
            switch (dateFilter) {
              case 'today':
                return searchDate.toDateString() === now.toDateString();
              case 'week':
                const weekAgo = new Date(now);
                weekAgo.setDate(weekAgo.getDate() - 7);
                return searchDate >= weekAgo;
              case 'month':
                const monthAgo = new Date(now);
                monthAgo.setMonth(monthAgo.getMonth() - 1);
                return searchDate >= monthAgo;
              default:
                return true;
            }
          });

          const totalItems = filteredSearches.length;
          const totalPages = Math.ceil(totalItems / ITEMS_PER_PAGE);
          const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
          const endIndex = startIndex + ITEMS_PER_PAGE;
          const currentItems = filteredSearches.slice(startIndex, endIndex);

          return (
            <Card>
              <Flex direction="column" gap="3">
                <Flex align="center" justify="between" wrap="wrap" gap="3">
                  <Heading size="5">Recent Searches</Heading>
                  <Flex align="center" gap="3">
                    <Flex align="center" gap="2">
                      <Text size="2" weight="medium">Filter:</Text>
                      <Select.Root value={dateFilter} onValueChange={(value: string) => {
                        setDateFilter(value as typeof dateFilter);
                        setCurrentPage(1);
                      }}>
                        <Select.Trigger style={{ minWidth: '120px' }} />
                        <Select.Content position="popper" sideOffset={5}>
                          <Select.Item value="all">All Time</Select.Item>
                          <Select.Item value="today">Today</Select.Item>
                          <Select.Item value="week">Last 7 Days</Select.Item>
                          <Select.Item value="month">Last 30 Days</Select.Item>
                        </Select.Content>
                      </Select.Root>
                    </Flex>
                    {totalItems > 0 && (
                      <Text size="2" color="gray">
                        {totalItems} {totalItems === 1 ? 'search' : 'searches'}
                      </Text>
                    )}
                  </Flex>
                </Flex>
                <Separator />
                {totalItems === 0 ? (
                  <Box p="4">
                    <Text size="2" color="gray" align="center">
                      {dateFilter === 'all' ? 'No recent searches yet' : `No searches found for ${dateFilter === 'today' ? 'today' : dateFilter === 'week' ? 'the last 7 days' : 'the last 30 days'}`}
                    </Text>
                  </Box>
                ) : (
                  <>
                    <Flex direction="column" gap="0">
                      {currentItems.map((search, idx) => {
                        const timestamp = new Date(search.timestamp);
                        const appName = search.instance
                          ? `${search.application} (${search.instance})`
                          : search.application;
                        const itemsPreview = search.items.length > 0
                          ? search.items.slice(0, 3).map((i: { id: number; title: string }) => i.title).join(', ') + (search.items.length > 3 ? ` +${search.items.length - 3} more` : '')
                          : 'No items';

                        return (
                          <Box
                            key={idx}
                            py="2"
                            px="3"
                            style={{
                              borderBottom: idx < currentItems.length - 1 ? '1px solid var(--gray-6)' : 'none',
                              cursor: 'pointer',
                              transition: 'background-color 0.15s'
                            }}
                            onClick={() => setSelectedSearch(search)}
                            onMouseEnter={(e: React.MouseEvent<HTMLDivElement>) => e.currentTarget.style.backgroundColor = 'var(--gray-2)'}
                            onMouseLeave={(e: React.MouseEvent<HTMLDivElement>) => e.currentTarget.style.backgroundColor = 'transparent'}
                          >
                            <Flex align="center" gap="3" justify="between">
                              <Flex align="center" gap="2" style={{ flex: 1, minWidth: 0 }}>
                                <AppIcon app={search.application} size={16} variant="light" />
                                <Badge size="1" style={{ textTransform: 'capitalize', flexShrink: 0 }}>
                                  {appName}
                                </Badge>
                                <Text size="2" style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {itemsPreview}
                                </Text>
                              </Flex>
                              <Flex align="center" gap="3" style={{ flexShrink: 0 }}>
                                <Text size="2" color="gray">
                                  {search.count} {search.count === 1 ? 'item' : 'items'}
                                </Text>
                                <Text size="2" color="gray" style={{ minWidth: '140px', textAlign: 'right' }}>
                                  {format(timestamp, 'PPp')}
                                </Text>
                              </Flex>
                            </Flex>
                          </Box>
                        );
                      })}
                    </Flex>
                    {totalPages > 1 && (
                      <Flex align="center" justify="center" gap="2" mt="1">
                        <Button
                          variant="outline"
                          size="2"
                          onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                          disabled={currentPage === 1}
                        >
                          <ChevronLeftIcon /> Previous
                        </Button>
                        <Flex gap="1" align="center">
                          {(() => {
                            const pages = [];
                            const pageRangeDisplayed = 5;
                            const marginPagesDisplayed = 2;

                            // Helper to add page button
                            const addPageButton = (page: number) => (
                              <Button
                                key={page}
                                variant={currentPage === page ? 'solid' : 'soft'}
                                size="2"
                                onClick={() => setCurrentPage(page)}
                              >
                                {page}
                              </Button>
                            );

                            // Helper to add ellipsis
                            const addEllipsis = (key: string) => (
                              <Text key={key} size="2" style={{ padding: '0 0.5rem' }}>...</Text>
                            );

                            // Always show first pages
                            for (let i = 1; i <= Math.min(marginPagesDisplayed, totalPages); i++) {
                              pages.push(addPageButton(i));
                            }

                            // Calculate range around current page
                            const rangeStart = Math.max(marginPagesDisplayed + 1, currentPage - Math.floor(pageRangeDisplayed / 2));
                            const rangeEnd = Math.min(totalPages - marginPagesDisplayed, currentPage + Math.floor(pageRangeDisplayed / 2));

                            // Add ellipsis before range if needed
                            if (rangeStart > marginPagesDisplayed + 1) {
                              pages.push(addEllipsis('ellipsis-start'));
                            }

                            // Add pages in range
                            for (let i = rangeStart; i <= rangeEnd; i++) {
                              if (i > marginPagesDisplayed && i <= totalPages - marginPagesDisplayed) {
                                pages.push(addPageButton(i));
                              }
                            }

                            // Add ellipsis after range if needed
                            if (rangeEnd < totalPages - marginPagesDisplayed) {
                              pages.push(addEllipsis('ellipsis-end'));
                            }

                            // Always show last pages
                            for (let i = Math.max(totalPages - marginPagesDisplayed + 1, marginPagesDisplayed + 1); i <= totalPages; i++) {
                              pages.push(addPageButton(i));
                            }

                            return pages;
                          })()}
                        </Flex>
                        <Button
                          variant="outline"
                          size="2"
                          onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                          disabled={currentPage === totalPages}
                        >
                          Next <ChevronRightIcon />
                        </Button>
                      </Flex>
                    )}
                  </>
                )}
              </Flex>
            </Card>
          );
        })()}

        {/* Dialog for viewing all items in a recent search entry */}
        <Dialog.Root
          open={!!selectedSearch}
          onOpenChange={(open: boolean) => {
            if (!open) {
              setSelectedSearch(null);
            }
          }}
        >
          <Dialog.Content maxWidth="480px">
            {selectedSearch && (
              <Flex direction="column" gap="3">
                <Dialog.Title>
                  {selectedSearch.instance
                    ? `${formatAppName(selectedSearch.application)} (${selectedSearch.instance})`
                    : formatAppName(selectedSearch.application)}
                </Dialog.Title>
                <Dialog.Description>
                  {selectedSearch.count} {selectedSearch.count === 1 ? 'item' : 'items'} searched on{' '}
                  {format(new Date(selectedSearch.timestamp), 'PPpp')}
                </Dialog.Description>
                <Separator />
                {selectedSearch.items.length === 0 ? (
                  <Text size="2" color="gray">
                    No items recorded for this search.
                  </Text>
                ) : (
                  <Flex
                    direction="column"
                    gap="2"
                    style={{ maxHeight: '320px', overflowY: 'auto' }}
                    >
                    {selectedSearch.items.map((item) => (
                      <Text
                        key={item.id}
                        size="2"
                        style={{ padding: '0.25rem 0' }}
                      >
                        {item.title}
                      </Text>
                    ))}
                  </Flex>
                )}
              </Flex>
            )}
          </Dialog.Content>
        </Dialog.Root>
      </Flex>
    </Box>
  );
}

export default Dashboard;
