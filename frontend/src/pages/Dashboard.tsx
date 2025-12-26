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
} from '@radix-ui/themes';
import { PlayIcon, ChevronLeftIcon, ChevronRightIcon, TrashIcon } from '@radix-ui/react-icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import humanizeDuration from 'humanize-duration';
import ReactPaginate from 'react-paginate';
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
  const [selectedTrigger, setSelectedTrigger] = useState<Stats['recentTriggers'][number] | null>(null);
  const [showPreviewDialog, setShowPreviewDialog] = useState(false);

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

  // Fetch run preview - load from database on mount
  const { data: manualRunResults } = useQuery<SearchResults>({
    queryKey: ['runPreview'],
    queryFn: async () => {
      // Try to get cached preview from database
      try {
        const cachedResponse = await axios.get('/api/search/run-preview');
        if (cachedResponse.status === 200) {
          return cachedResponse.data;
        }
      } catch (error) {
        // If no cached preview exists, return empty object (don't generate new on mount)
        return {};
      }
      return {};
    },
    enabled: false, // Don't fetch on mount - only fetch when button is clicked
    staleTime: Infinity, // Preview never goes stale - it only changes when config/runs happen
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

  // Mutation for clearing recent triggers
  const clearRecentMutation = useMutation({
    mutationFn: async () => {
      await axios.post('/api/stats/clear-recent');
    },
    onSuccess: () => {
      toast.success('Recent triggers cleared');
      setCurrentPage(1);
      setConfirmingClear(null);
      refetchStats();
    },
    onError: (error: unknown) => {
      toast.error('Failed to clear recent triggers: ' + getErrorMessage(error));
      setConfirmingClear(null);
    },
  });

  // Mutation for clearing stats
  const clearStatsMutation = useMutation({
    mutationFn: async () => {
      await axios.post('/api/stats/clear-data');
    },
    onSuccess: () => {
      toast.success('Recent triggers and stats cleared');
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
    
    return (
      <Flex gap="2" align="center">
        <Text size="2" color="gray">Are you sure?</Text>
        <Button 
          variant="solid" 
          color="red"
          size="2" 
          onClick={onConfirm}
          disabled={
            (type === 'stats' && clearStatsMutation.isPending) ||
            (type === 'recent' && clearRecentMutation.isPending)
          }
        >
          Confirm
        </Button>
        <Button 
          variant="outline" 
          size="2" 
          onClick={() => setConfirmingClear(null)}
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
            
            // Show triggered action
            logs.push({
              timestamp,
              app,
              message: `${appName}: Triggered search for ${searched} ${mediaType}`,
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
      <Card mb="4">
        <Flex align="center" justify="between" mb="3">
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
          </Flex>
          <Flex gap="3">
            <Tooltip content="Trigger a search run immediately using the current configuration.">
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
            <Tooltip content="Generate and preview what will be searched in the next run.">
              <Button
                size="2"
                variant="outline"
                onClick={async () => {
                  try {
                    // Generate new preview and store in database
                    const response = await axios.post('/api/search/run-preview');
                    queryClient.setQueryData(['runPreview'], response.data);
                    setShowPreviewDialog(true);
                  } catch (error: unknown) {
                    toast.error('Failed to generate preview: ' + getErrorMessage(error));
                  }
                }}
              >
                Next Run Preview
              </Button>
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
                No scheduler runs yet. The scheduler will automatically trigger searches based on the schedule.
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
      </Card>
    );
  };

  return (
    <div style={{ width: '100%', paddingTop: 0, marginTop: 0 }}>
      <Flex direction="column" gap="3">
        {renderAutomaticRunPreview()}

        {stats && (() => {
          // Calculate totals for all app types
          let lidarrTotal = 0;
          let radarrTotal = 0;
          let sonarrTotal = 0;
          let readarrTotal = 0;
          
          Object.entries(stats.triggersByInstance || {}).forEach(([instanceKey, count]) => {
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
          
          // Fallback to triggersByApplication if triggersByInstance is empty
          if (lidarrTotal === 0 && radarrTotal === 0 && sonarrTotal === 0 && readarrTotal === 0) {
            lidarrTotal = stats.triggersByApplication?.lidarr || 0;
            radarrTotal = stats.triggersByApplication?.radarr || 0;
            sonarrTotal = stats.triggersByApplication?.sonarr || 0;
            readarrTotal = stats.triggersByApplication?.readarr || 0;
          }
          
          return (
            <Card>
              <Flex direction="column" gap="3">
                <Flex align="center" justify="between">
                  <Heading size="5">Statistics</Heading>
                  <Tooltip content="Delete all trigger history and tagged media records from the database. This will reset all statistics to zero.">
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
                        <Text size="2" color="gray" style={{ textAlign: 'center' }}>Lidarr</Text>
                      </Flex>
                      <Heading size="7" style={{ textAlign: 'center' }}>{lidarrTotal}</Heading>
                    </Flex>
                  </Card>
                  <Card variant="surface" style={{ flex: '1 1 200px', minWidth: '150px' }}>
                    <Flex direction="column" gap="2" align="center" justify="center">
                      <Flex align="center" gap="2">
                        <AppIcon app="radarr" size={20} variant="light" />
                        <Text size="2" color="gray" style={{ textAlign: 'center' }}>Radarr</Text>
                      </Flex>
                      <Heading size="7" style={{ textAlign: 'center' }}>{radarrTotal}</Heading>
                    </Flex>
                  </Card>
                  <Card variant="surface" style={{ flex: '1 1 200px', minWidth: '150px' }}>
                    <Flex direction="column" gap="2" align="center" justify="center">
                      <Text size="2" color="gray" style={{ textAlign: 'center' }}>Total Triggered</Text>
                      <Heading size="7" style={{ textAlign: 'center' }}>{stats.totalTriggers}</Heading>
                    </Flex>
                  </Card>
                  <Card variant="surface" style={{ flex: '1 1 200px', minWidth: '150px' }}>
                    <Flex direction="column" gap="2" align="center" justify="center">
                      <Flex align="center" gap="2">
                        <AppIcon app="sonarr" size={20} variant="light" />
                        <Text size="2" color="gray" style={{ textAlign: 'center' }}>Sonarr</Text>
                      </Flex>
                      <Heading size="7" style={{ textAlign: 'center' }}>{sonarrTotal}</Heading>
                    </Flex>
                  </Card>
                  <Card variant="surface" style={{ flex: '1 1 200px', minWidth: '150px' }}>
                    <Flex direction="column" gap="2" align="center" justify="center">
                      <Flex align="center" gap="2">
                        <AppIcon app="readarr" size={20} variant="light" />
                        <Text size="2" color="gray" style={{ textAlign: 'center' }}>Readarr</Text>
                      </Flex>
                      <Heading size="7" style={{ textAlign: 'center' }}>{readarrTotal}</Heading>
                    </Flex>
                  </Card>
                </Flex>
                {stats.lastTrigger && (
                  <Text size="2" color="gray">
                    Last trigger: {format(new Date(stats.lastTrigger), 'PPpp')}
                  </Text>
                )}
              </Flex>
            </Card>
          );
        })()}

        {stats && (() => {
          const recentTriggers = stats.recentTriggers || [];
          const totalItems = recentTriggers.length;
          const totalPages = Math.ceil(totalItems / ITEMS_PER_PAGE);
          const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
          const endIndex = startIndex + ITEMS_PER_PAGE;
          const currentItems = recentTriggers.slice(startIndex, endIndex);
          
          return (
            <Card>
              <Flex direction="column" gap="2">
                <Flex align="center" justify="between">
                  <Heading size="5">Recent Triggers</Heading>
                  {totalItems > 0 && totalPages > 1 && (
                    <Text size="2" color="gray">
                      Page {currentPage} of {totalPages} ({totalItems} total)
                    </Text>
                  )}
                </Flex>
                <Separator />
                {totalItems === 0 ? (
                  <Text size="2" color="gray" style={{ textAlign: 'center', padding: '1rem' }}>
                    No recent triggers yet
                  </Text>
                ) : (
                  <>
                    <Flex direction="column" gap="1" style={{ maxHeight: '400px', overflowY: 'auto' }}>
                      {currentItems.map((trigger, idx) => {
                        const timestamp = new Date(trigger.timestamp);
                        const appName = trigger.instance 
                          ? `${trigger.application} (${trigger.instance})`
                          : trigger.application;
                        const itemsPreview = trigger.items.length > 0
                          ? trigger.items.slice(0, 2).map(i => i.title).join(', ') + (trigger.items.length > 2 ? ` +${trigger.items.length - 2}` : '')
                          : 'No items';
                        
                        return (
                          <Flex 
                            key={idx} 
                            align="center" 
                            gap="2" 
                            style={{ 
                              padding: '0.5rem',
                              borderBottom: idx < currentItems.length - 1 ? '1px solid var(--gray-6)' : 'none',
                              cursor: 'pointer'
                            }}
                            onClick={() => setSelectedTrigger(trigger)}
                          >
                            <AppIcon app={trigger.application} size={16} variant="light" />
                            <Badge size="1" style={{ textTransform: 'capitalize', minWidth: '60px', textAlign: 'center' }}>
                              {appName}
                            </Badge>
                            <Text size="2" weight="medium" style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {itemsPreview}
                            </Text>
                            <Text size="1" color="gray" style={{ minWidth: '120px', textAlign: 'right' }}>
                              {format(timestamp, 'PPp')}
                            </Text>
                            <Text size="1" color="gray" style={{ minWidth: '50px', textAlign: 'right' }}>
                              {trigger.count} {trigger.count === 1 ? 'item' : 'items'}
                            </Text>
                          </Flex>
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
                        <ReactPaginate
                          pageCount={totalPages}
                          pageRangeDisplayed={5}
                          marginPagesDisplayed={2}
                          onPageChange={({ selected }) => setCurrentPage(selected + 1)}
                          forcePage={currentPage - 1}
                          containerClassName="pagination"
                          activeClassName="active"
                          previousLabel={null}
                          nextLabel={null}
                          breakLabel={<Text size="2" style={{ padding: '0.5rem' }}>...</Text>}
                          pageClassName="page-item"
                          pageLinkClassName="page-link"
                          breakClassName="page-item break-item"
                          disabledClassName="disabled"
                          renderOnZeroPageCount={null}
                        />
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

        {/* Dialog for preview of next run */}
        <Dialog.Root open={showPreviewDialog} onOpenChange={setShowPreviewDialog}>
          <Dialog.Content maxWidth="500px">
            <Dialog.Title>Next Run Preview</Dialog.Title>
            <Separator mb="4" />
            {manualRunResults && Object.keys(manualRunResults).length > 0 ? (
              <Flex direction="column" gap="2">
                {Object.entries(manualRunResults).map(([appKey, result]) => {
                  if (!result.success) {
                    return null;
                  }

                  const appName = result.instanceName || formatAppName(appKey);
                  const count = result.count || 0;
                  const total = result.total || 0;
                  const mediaType = result.movies ? 'movies' : result.artists ? 'artists' : result.authors ? 'authors' : 'series';
                  const mediaTypeLabel = mediaType === 'movies' ? 'Movie' : mediaType === 'artists' ? 'Artist' : mediaType === 'authors' ? 'Author' : 'Series';
                  const mediaTypeLabelPlural = count === 1 ? mediaTypeLabel : mediaTypeLabel + 's';

                  return (
                    <Flex key={appKey} align="center" gap="2" py="2">
                      <AppIcon app={appKey} size={16} variant="light" />
                      <Text size="3" weight="medium" style={{ flex: 1 }}>{appName}</Text>
                      <Text size="2" color="gray">
                        Will search {count} {mediaTypeLabelPlural} out of {total}
                      </Text>
                    </Flex>
                  );
                })}
              </Flex>
            ) : (
              <Text size="2" color="gray" style={{ fontStyle: 'italic' }}>
                No preview available
              </Text>
            )}
          </Dialog.Content>
        </Dialog.Root>

        {/* Dialog for viewing all items in a recent trigger entry */}
        <Dialog.Root
          open={!!selectedTrigger}
          onOpenChange={(open) => {
            if (!open) {
              setSelectedTrigger(null);
            }
          }}
        >
          <Dialog.Content maxWidth="480px">
            {selectedTrigger && (
              <Flex direction="column" gap="3">
                <Dialog.Title>
                  {selectedTrigger.instance
                    ? `${formatAppName(selectedTrigger.application)} (${selectedTrigger.instance})`
                    : formatAppName(selectedTrigger.application)}
                </Dialog.Title>
                <Dialog.Description>
                  {selectedTrigger.count} {selectedTrigger.count === 1 ? 'item' : 'items'} triggered on{' '}
                  {format(new Date(selectedTrigger.timestamp), 'PPpp')}
                </Dialog.Description>
                <Separator />
                {selectedTrigger.items.length === 0 ? (
                  <Text size="2" color="gray">
                    No items recorded for this trigger.
                  </Text>
                ) : (
                  <Flex
                    direction="column"
                    gap="2"
                    style={{ maxHeight: '320px', overflowY: 'auto' }}
                    >
                    {selectedTrigger.items.map((item) => (
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
    </div>
  );
}

export default Dashboard;
