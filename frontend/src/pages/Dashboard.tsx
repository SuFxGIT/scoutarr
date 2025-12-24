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
import { PlayIcon, ReloadIcon, ChevronLeftIcon, ChevronRightIcon, TrashIcon } from '@radix-ui/react-icons';
import { useQuery, useMutation } from '@tanstack/react-query';
import { format } from 'date-fns';
import humanizeDuration from 'humanize-duration';
import ReactPaginate from 'react-paginate';
import { toast } from 'sonner';
import axios from 'axios';
import { formatAppName, getErrorMessage } from '../utils/helpers';
import { ITEMS_PER_PAGE, REFETCH_INTERVAL, APP_TYPES } from '../utils/constants';

interface SearchResults {
  [key: string]: {
    success: boolean;
    searched?: number;
    count?: number;
    total?: number;
    movies?: Array<{ id: number; title: string }>;
    series?: Array<{ id: number; title: string }>;
    artists?: Array<{ id: number; title: string }>;
    authors?: Array<{ id: number; title: string }>;
    items?: Array<{ id: number; title: string }>;
    error?: string;
  };
}

interface Stats {
  totalUpgrades: number;
  upgradesByApplication: Record<string, number>;
  upgradesByInstance: Record<string, number>;
  recentUpgrades: Array<{
    timestamp: string;
    application: string;
    instance?: string;
    count: number;
    items: Array<{ id: number; title: string }>;
  }>;
  lastUpgrade?: string;
}

interface StatusResponse {
  [key: string]: any;
  scheduler?: {
    enabled: boolean;
    running: boolean;
    schedule: string | null;
    nextRun: string | null;
    instances?: Record<string, { schedule: string; nextRun: string | null; running: boolean }>;
  };
}

interface SchedulerHistoryEntry {
  timestamp: string;
  results: any;
  success: boolean;
  error?: string;
}

function Dashboard() {
  const [currentPage, setCurrentPage] = useState(1);
  const logContainerRef = useRef<HTMLDivElement>(null);
  const [confirmingClear, setConfirmingClear] = useState<'stats' | 'recent' | null>(null);
  const [selectedUpgrade, setSelectedUpgrade] = useState<Stats['recentUpgrades'][number] | null>(null);

  // Fetch status with auto-refresh
  const { data: statusData } = useQuery<StatusResponse>({
    queryKey: ['status'],
    queryFn: async () => {
      const response = await axios.get('/api/status');
      return response.data;
    },
    refetchInterval: REFETCH_INTERVAL,
  });

  const connectionStatus = statusData || {};
  const schedulerStatus = statusData?.scheduler || null;

  // Fetch scheduler history with auto-refresh
  const { data: schedulerHistory = [], refetch: refetchHistory } = useQuery<SchedulerHistoryEntry[]>({
    queryKey: ['schedulerHistory'],
    queryFn: async () => {
      const response = await axios.get('/api/status/scheduler/history');
      return response.data;
    },
    refetchInterval: REFETCH_INTERVAL,
  });

  // Fetch manual run preview with auto-refresh
  const { data: manualRunResults } = useQuery<SearchResults>({
    queryKey: ['manualRunPreview'],
    queryFn: async () => {
      const response = await axios.post('/api/search/manual-run');
      return response.data;
    },
    refetchInterval: REFETCH_INTERVAL,
  });

  // Fetch stats with auto-refresh
  const { data: stats, refetch: refetchStats } = useQuery<Stats>({
    queryKey: ['stats'],
    queryFn: async () => {
      const response = await axios.get('/api/stats');
      return response.data;
    },
    refetchInterval: REFETCH_INTERVAL,
  });

  // Auto-scroll to bottom when scheduler history changes
  useEffect(() => {
    if (logContainerRef.current && schedulerHistory.length > 0) {
      const container = logContainerRef.current;
      const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 100;
      
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

  // Mutation for clearing recent upgrades
  const clearRecentMutation = useMutation({
    mutationFn: async () => {
      await axios.post('/api/stats/clear-recent');
    },
    onSuccess: () => {
      toast.success('Recent upgrades cleared');
      setCurrentPage(1);
      setConfirmingClear(null);
      refetchStats();
    },
    onError: (error: unknown) => {
      toast.error('Failed to clear recent upgrades: ' + getErrorMessage(error));
      setConfirmingClear(null);
    },
  });

  // Mutation for clearing stats
  const clearStatsMutation = useMutation({
    mutationFn: async () => {
      await axios.post('/api/stats/reset');
    },
    onSuccess: () => {
      toast.success('Stats cleared');
      setCurrentPage(1);
      setConfirmingClear(null);
      refetchStats();
    },
    onError: (error: unknown) => {
      toast.error('Failed to clear stats: ' + getErrorMessage(error));
      setConfirmingClear(null);
    },
  });

  // Mutation for clearing scheduler history
  const clearHistoryMutation = useMutation({
    mutationFn: async () => {
      await axios.post('/api/status/scheduler/history/clear');
    },
    onSuccess: () => {
      toast.success('Scheduler history cleared');
      refetchHistory();
    },
    onError: (error: unknown) => {
      toast.error('Failed to clear history: ' + getErrorMessage(error));
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
    previewResults?: SearchResults | null,
    instanceSchedules?: Record<string, { schedule: string; nextRun: string | null; running: boolean }>,
    connectionStatus?: StatusResponse
  ): Array<{ timestamp: string; app: string; message: string; type: 'success' | 'error' | 'info' }> => {
    const logs: Array<{ timestamp: string; app: string; message: string; type: 'success' | 'error' | 'info' }> = [];
    
    // Add preview of what will be triggered next
    if (previewResults && Object.keys(previewResults).length > 0) {
      const now = new Date();
      logs.push({
        timestamp: format(now, 'HH:mm:ss'),
        app: 'Preview',
        message: 'Next run will trigger:',
        type: 'info'
      });
      
      Object.entries(previewResults).forEach(([app, result]: [string, any]) => {
        if (result.success) {
          const appName = formatAppName(app);
          const count = result.count || 0;
          const total = result.total || 0;
          
          logs.push({
            timestamp: format(now, 'HH:mm:ss'),
            app: 'Preview',
            message: `${appName}: Will search ${count} of ${total} items`,
            type: 'info'
          });
        }
      });
      
      logs.push({
        timestamp: format(now, 'HH:mm:ss'),
        app: 'Preview',
        message: '---',
        type: 'info'
      });
    }
    
    // Add global scheduler next run time if enabled
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
          
          // Try to get instance name from connectionStatus if available, fallback to formatted key
          const instanceStatusData = connectionStatus?.[instanceKey];
          const instanceName = instanceStatusData?.instanceName || formatAppName(instanceKey);
          
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
        Object.entries(entry.results).forEach(([app, result]: [string, any]) => {
          if (result.success) {
            const appName = formatAppName(app);
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
            const items = result.movies || result.series || result.artists || result.authors || result.items || [];
            if (items.length > 0) {
              items.forEach((item: any) => {
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
            logs.push({
              timestamp,
              app,
              message: `${formatAppName(app)}: Error - ${result.error || 'Unknown error'}`,
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
    const logs = convertHistoryToLogs(
      schedulerHistory, 
      schedulerStatus?.nextRun || null, 
      schedulerStatus?.enabled || false, 
      manualRunResults || null,
      schedulerStatus?.instances,
      connectionStatus
    );

    return (
      <Card mb="4">
        <Flex align="center" justify="between" mb="3">
          <Flex align="center" gap="2">
            <Heading size="5">Logs</Heading>
            {schedulerStatus && (
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
            <Tooltip content="Refresh logs.">
              <span>
                <Button 
                  variant="outline" 
                  size="2" 
                  onClick={() => refetchHistory()}
                >
                  <ReloadIcon />
                </Button>
              </span>
            </Tooltip>
          </Flex>
        </Flex>
        <Card variant="surface" style={{ backgroundColor: '#1a1a1a', fontFamily: 'monospace' }}>
          <div
            ref={logContainerRef}
            style={{
              height: '400px',
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
                  <Text 
                    size="2" 
                    style={{ 
                      color: log.type === 'error' ? 'var(--red-9)' : log.type === 'success' ? 'var(--green-9)' : 'var(--gray-9)',
                      whiteSpace: 'pre-wrap'
                    }}
                  >
                    [{log.timestamp}] {formatAppName(log.app)}: {log.message}
                  </Text>
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
        <Card style={{ padding: '0.5rem' }}>
          <Flex align="center" justify="between" gap="2" wrap="wrap" style={{ margin: 0, padding: 0 }}>
            <Flex gap="2" wrap="wrap" style={{ margin: 0, padding: 0, flex: 1 }}>
              {(() => {
                // Group status entries by app type
                const groupedStatus: Record<string, { connected: number; total: number; configured: boolean }> = {};
                
                // Initialize all app types
                APP_TYPES.forEach(appType => {
                  groupedStatus[appType] = { connected: 0, total: 0, configured: true };
                });
                
                // Process connection status entries
                Object.entries(connectionStatus).forEach(([key, status]: [string, any]) => {
                  if (key === 'scheduler') return;
                  
                  // Check if it's an app type directly (for backward compatibility or "not configured" case)
                  if (APP_TYPES.includes(key as any)) {
                    if (status.configured === false) {
                      groupedStatus[key].configured = false;
                    }
                    return;
                  }
                  
                  // It's an instance ID (e.g., "radarr-123" or "sonarr-instance-id")
                  const appType = key.split('-')[0];
                  if (APP_TYPES.includes(appType as any)) {
                    groupedStatus[appType].total++;
                    if (status.connected) {
                      groupedStatus[appType].connected++;
                    }
                    groupedStatus[appType].configured = true; // Has at least one instance configured
                  }
                });
                
                // Generate badges for each app type
                return APP_TYPES.map(appType => {
                  const stats = groupedStatus[appType];
                  const appName = appType.charAt(0).toUpperCase() + appType.slice(1);
                  let statusMessage = '';
                  let badgeColor: 'green' | 'gray' | 'red' = 'red';
                  
                  if (!stats.configured) {
                    statusMessage = 'Not Configured';
                    badgeColor = 'gray';
                  } else if (stats.connected > 0) {
                    statusMessage = `${stats.connected} Instance${stats.connected === 1 ? '' : 's'} connected`;
                    badgeColor = 'green';
                  } else if (stats.total > 0) {
                    statusMessage = `${stats.total} Instance${stats.total === 1 ? '' : 's'} disconnected`;
                    badgeColor = 'red';
                  } else {
                    statusMessage = 'Not Configured';
                    badgeColor = 'gray';
                  }
                  
                  return (
                    <Badge 
                      key={appType} 
                      color={badgeColor}
                      size="2"
                    >
                      {appName}: {statusMessage}
                    </Badge>
                  );
                });
              })()}
            </Flex>
            <Flex>
              <Tooltip content="Reset all statistics and recent triggers.">
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
          </Flex>
        </Card>

        {stats && (() => {
          // Calculate totals for all app types
          let lidarrTotal = 0;
          let radarrTotal = 0;
          let sonarrTotal = 0;
          let readarrTotal = 0;
          
          Object.entries(stats.upgradesByInstance || {}).forEach(([instanceKey, count]) => {
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
          
          // Fallback to upgradesByApplication if upgradesByInstance is empty
          if (lidarrTotal === 0 && radarrTotal === 0 && sonarrTotal === 0 && readarrTotal === 0) {
            lidarrTotal = stats.upgradesByApplication?.lidarr || 0;
            radarrTotal = stats.upgradesByApplication?.radarr || 0;
            sonarrTotal = stats.upgradesByApplication?.sonarr || 0;
            readarrTotal = stats.upgradesByApplication?.readarr || 0;
          }
          
          return (
            <Card>
              <Flex direction="column" gap="3">
                <Flex align="center" justify="between">
                  <Heading size="5">Statistics</Heading>
                </Flex>
                <Separator />
                <Flex gap="3" wrap="wrap" justify="center">
                  <Card variant="surface" style={{ flex: '1 1 200px', minWidth: '150px' }}>
                    <Flex direction="column" gap="2" align="center" justify="center">
                      <Text size="2" color="gray" style={{ textAlign: 'center' }}>Lidarr</Text>
                      <Heading size="7" style={{ textAlign: 'center' }}>{lidarrTotal}</Heading>
                    </Flex>
                  </Card>
                  <Card variant="surface" style={{ flex: '1 1 200px', minWidth: '150px' }}>
                    <Flex direction="column" gap="2" align="center" justify="center">
                      <Text size="2" color="gray" style={{ textAlign: 'center' }}>Radarr</Text>
                      <Heading size="7" style={{ textAlign: 'center' }}>{radarrTotal}</Heading>
                    </Flex>
                  </Card>
                  <Card variant="surface" style={{ flex: '1 1 200px', minWidth: '150px' }}>
                    <Flex direction="column" gap="2" align="center" justify="center">
                      <Text size="2" color="gray" style={{ textAlign: 'center' }}>Total Triggered</Text>
                      <Heading size="7" style={{ textAlign: 'center' }}>{stats.totalUpgrades}</Heading>
                    </Flex>
                  </Card>
                  <Card variant="surface" style={{ flex: '1 1 200px', minWidth: '150px' }}>
                    <Flex direction="column" gap="2" align="center" justify="center">
                      <Text size="2" color="gray" style={{ textAlign: 'center' }}>Sonarr</Text>
                      <Heading size="7" style={{ textAlign: 'center' }}>{sonarrTotal}</Heading>
                    </Flex>
                  </Card>
                  <Card variant="surface" style={{ flex: '1 1 200px', minWidth: '150px' }}>
                    <Flex direction="column" gap="2" align="center" justify="center">
                      <Text size="2" color="gray" style={{ textAlign: 'center' }}>Readarr</Text>
                      <Heading size="7" style={{ textAlign: 'center' }}>{readarrTotal}</Heading>
                    </Flex>
                  </Card>
                </Flex>
                {stats.lastUpgrade && (
                  <Text size="2" color="gray">
                    Last upgrade: {format(new Date(stats.lastUpgrade), 'PPpp')}
                  </Text>
                )}
              </Flex>
            </Card>
          );
        })()}

        {renderAutomaticRunPreview()}

        {stats && (() => {
          const recentUpgrades = stats.recentUpgrades || [];
          const totalItems = recentUpgrades.length;
          const totalPages = Math.ceil(totalItems / ITEMS_PER_PAGE);
          const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
          const endIndex = startIndex + ITEMS_PER_PAGE;
          const currentItems = recentUpgrades.slice(startIndex, endIndex);
          
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
                    No recent upgrades yet
                  </Text>
                ) : (
                  <>
                    <Flex direction="column" gap="1" style={{ maxHeight: '400px', overflowY: 'auto' }}>
                      {currentItems.map((upgrade, idx) => {
                        const timestamp = new Date(upgrade.timestamp);
                        const appName = upgrade.instance 
                          ? `${upgrade.application} (${upgrade.instance})`
                          : upgrade.application;
                        const itemsPreview = upgrade.items.length > 0
                          ? upgrade.items.slice(0, 2).map(i => i.title).join(', ') + (upgrade.items.length > 2 ? ` +${upgrade.items.length - 2}` : '')
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
                            onClick={() => setSelectedUpgrade(upgrade)}
                          >
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
                              {upgrade.count} {upgrade.count === 1 ? 'item' : 'items'}
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

        {/* Dialog for viewing all items in a recent upgrade entry */}
        <Dialog.Root
          open={!!selectedUpgrade}
          onOpenChange={(open) => {
            if (!open) {
              setSelectedUpgrade(null);
            }
          }}
        >
          <Dialog.Content maxWidth="480px">
            {selectedUpgrade && (
              <Flex direction="column" gap="3">
                <Dialog.Title>
                  {selectedUpgrade.instance
                    ? `${formatAppName(selectedUpgrade.application)} (${selectedUpgrade.instance})`
                    : formatAppName(selectedUpgrade.application)}
                </Dialog.Title>
                <Dialog.Description>
                  {selectedUpgrade.count} {selectedUpgrade.count === 1 ? 'item' : 'items'} triggered on{' '}
                  {format(new Date(selectedUpgrade.timestamp), 'PPpp')}
                </Dialog.Description>
                <Separator />
                {selectedUpgrade.items.length === 0 ? (
                  <Text size="2" color="gray">
                    No items recorded for this upgrade.
                  </Text>
                ) : (
                  <Flex
                    direction="column"
                    gap="2"
                    style={{ maxHeight: '320px', overflowY: 'auto' }}
                    >
                    {selectedUpgrade.items.map((item) => (
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
