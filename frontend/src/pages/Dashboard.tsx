import { useState, useEffect, useRef } from 'react';
import { 
  Flex, 
  Heading, 
  Button, 
  Card, 
  Text, 
  Badge,
  Separator,
  Callout
} from '@radix-ui/themes';
import { PlayIcon, ReloadIcon, CrossCircledIcon, ChevronLeftIcon, ChevronRightIcon } from '@radix-ui/react-icons';
import axios from 'axios';

interface SearchResults {
  [key: string]: {
    success: boolean;
    searched?: number;
    count?: number;
    total?: number;
    movies?: Array<{ id: number; title: string }>;
    series?: Array<{ id: number; title: string }>;
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

function Dashboard() {
  const [isRunning, setIsRunning] = useState(false);
  const [manualRunResults, setManualRunResults] = useState<SearchResults | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<Record<string, any>>({});
  const [stats, setStats] = useState<Stats | null>(null);
  const [schedulerHistory, setSchedulerHistory] = useState<Array<{ timestamp: string; results: any; success: boolean; error?: string }>>([]);
  const [schedulerStatus, setSchedulerStatus] = useState<{ enabled: boolean; running: boolean; schedule: string | null; nextRun: string | null } | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 15;
  const logContainerRef = useRef<HTMLDivElement>(null);
  const [confirmingClear, setConfirmingClear] = useState<'stats' | 'recent' | null>(null);

  useEffect(() => {
    loadStatus();
    loadSchedulerHistory();
    loadStats();
    
    // Load preview of what will be triggered
    loadManualRun();
    
    // Poll for scheduler history, status, stats, and preview updates every 10 seconds
    const interval = setInterval(() => {
      loadSchedulerHistory();
      loadStatus();
      loadStats(); // Auto-refresh stats to catch scheduler-triggered upgrades
      loadManualRun(); // Refresh preview of what will be triggered
    }, 10000);
    
    return () => clearInterval(interval);
  }, []);


  const loadStatus = async () => {
    try {
      const response = await axios.get('/api/status');
      setConnectionStatus(response.data);
      // Extract scheduler status
      if (response.data.scheduler) {
        setSchedulerStatus(response.data.scheduler);
      }
    } catch (error) {
      console.error('Failed to load status:', error);
    }
  };

  const formatAppName = (app: string) => {
    if (app.includes('-')) {
      const parts = app.split('-');
      const appType = parts[0].charAt(0).toUpperCase() + parts[0].slice(1);
      return appType;
    }
    return app.charAt(0).toUpperCase() + app.slice(1);
  };

  const loadSchedulerHistory = async () => {
    try {
      const response = await axios.get('/api/status/scheduler/history');
      setSchedulerHistory(response.data);
    } catch (error) {
      console.error('Failed to load scheduler history:', error);
    }
  };

  const loadManualRun = async () => {
    try {
      const response = await axios.post('/api/search/manual-run');
      setManualRunResults(response.data);
    } catch (error) {
      console.error('Failed to load manual run preview:', error);
    }
  };

  const loadStats = async () => {
    try {
      const response = await axios.get('/api/stats');
      setStats(response.data);
    } catch (error) {
      console.error('Failed to load stats:', error);
    }
  };

  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleClearRecentUpgrades = async () => {
    try {
      await axios.post('/api/stats/clear-recent');
      await loadStats();
      setCurrentPage(1);
      setConfirmingClear(null);
      setErrorMessage(null);
    } catch (error: any) {
      console.error('Failed to clear recent upgrades:', error);
      setErrorMessage('Failed to clear recent upgrades: ' + (error.response?.data?.error || error.message));
      setConfirmingClear(null);
    }
  };

  const handleClearStats = async () => {
    try {
      await axios.post('/api/stats/reset');
      await loadStats();
      setCurrentPage(1);
      setConfirmingClear(null);
      setErrorMessage(null);
    } catch (error: any) {
      console.error('Failed to clear stats:', error);
      setErrorMessage('Failed to clear stats: ' + (error.response?.data?.error || error.message));
      setConfirmingClear(null);
    }
  };

  const handleRun = async () => {
    setIsRunning(true);
    try {
      await axios.post('/api/search/run');
      await loadStats(); // Refresh stats after actual run
    } catch (error: any) {
      console.error('Search failed:', error);
      // Error is already logged to console, and scheduler history will show it
    } finally {
      setIsRunning(false);
    }
  };

  // Convert scheduler history to log format
  const convertHistoryToLogs = (history: typeof schedulerHistory, nextRun: string | null, schedulerEnabled: boolean, previewResults?: SearchResults | null): Array<{ timestamp: string; app: string; message: string; type: 'success' | 'error' | 'info' }> => {
    const logs: Array<{ timestamp: string; app: string; message: string; type: 'success' | 'error' | 'info' }> = [];
    
    // Add preview of what will be triggered next
    if (previewResults && Object.keys(previewResults).length > 0) {
      logs.push({
        timestamp: new Date().toLocaleTimeString(),
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
            timestamp: new Date().toLocaleTimeString(),
            app: 'Preview',
            message: `${appName}: Will search ${count} of ${total} items`,
            type: 'info'
          });
        }
      });
      
      logs.push({
        timestamp: new Date().toLocaleTimeString(),
        app: 'Preview',
        message: '---',
        type: 'info'
      });
    }
    
    // Add next run time at the top if scheduler is enabled
    if (schedulerEnabled && nextRun) {
      const nextRunDate = new Date(nextRun);
      const now = new Date();
      const timeUntilNext = nextRunDate.getTime() - now.getTime();
      const minutesUntil = Math.floor(timeUntilNext / 60000);
      const hoursUntil = Math.floor(minutesUntil / 60);
      const daysUntil = Math.floor(hoursUntil / 24);
      
      let timeString = '';
      if (daysUntil > 0) {
        timeString = `${daysUntil} day${daysUntil > 1 ? 's' : ''}, ${hoursUntil % 24} hour${(hoursUntil % 24) !== 1 ? 's' : ''}`;
      } else if (hoursUntil > 0) {
        timeString = `${hoursUntil} hour${hoursUntil > 1 ? 's' : ''}, ${minutesUntil % 60} minute${(minutesUntil % 60) !== 1 ? 's' : ''}`;
      } else if (minutesUntil > 0) {
        timeString = `${minutesUntil} minute${minutesUntil > 1 ? 's' : ''}`;
      } else {
        timeString = 'less than a minute';
      }
      
      logs.push({
        timestamp: new Date().toLocaleTimeString(),
        app: 'Scheduler',
        message: `Next run: ${nextRunDate.toLocaleString()} (in ${timeString})`,
        type: 'info'
      });
    }
    
    history.forEach(entry => {
      const timestamp = new Date(entry.timestamp).toLocaleTimeString();
      
      if (entry.success) {
        Object.entries(entry.results).forEach(([app, result]: [string, any]) => {
          if (result.success) {
            const appName = formatAppName(app);
            const searched = result.searched || 0;
            
            // Show triggered action
            logs.push({
              timestamp,
              app,
              message: `${appName}: Triggered search for ${searched} ${result.movies ? 'movies' : 'series'}`,
              type: 'success'
            });
            
            // Show searched items
            if (result.movies && result.movies.length > 0) {
              result.movies.forEach((movie: any) => {
                logs.push({
                  timestamp,
                  app,
                  message: `  → Movie: ${movie.title}`,
                  type: 'info'
                });
              });
            }
            if (result.series && result.series.length > 0) {
              result.series.forEach((series: any) => {
                logs.push({
                  timestamp,
                  app,
                  message: `  → Series: ${series.title}`,
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

  // Auto-scroll to bottom
  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [schedulerHistory]);

  const renderAutomaticRunPreview = () => {
    const logs = convertHistoryToLogs(schedulerHistory, schedulerStatus?.nextRun || null, schedulerStatus?.enabled || false, manualRunResults);

    return (
      <Card mb="4">
        <Flex align="center" justify="between" mb="3">
          <Flex direction="column" gap="1">
            <Heading size="5">Logs</Heading>
            {schedulerStatus && !schedulerStatus.enabled && (
              <Text size="2" color="gray">
                Scheduler disabled
              </Text>
            )}
          </Flex>
          <Flex gap="3">
            <Button 
              size="3" 
              onClick={handleRun} 
              disabled={isRunning}
            >
              <PlayIcon /> {isRunning ? 'Running...' : 'Manually Run Now'}
            </Button>
            <Button 
              variant="outline" 
              size="3" 
              onClick={async () => {
                try {
                  await axios.post('/api/status/scheduler/history/clear');
                  setSchedulerHistory([]);
                } catch (error) {
                  console.error('Failed to clear history:', error);
                }
              }}
            >
              Clear History
            </Button>
            <Button 
              variant="outline" 
              size="3" 
              onClick={loadSchedulerHistory}
            >
              <ReloadIcon /> Refresh
            </Button>
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
                      color: log.type === 'error' ? '#ef4444' : log.type === 'success' ? '#22c55e' : '#94a3b8',
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

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString();
  };

  return (
    <div style={{ width: '100%', paddingTop: 0, marginTop: 0 }}>
      <Flex direction="column" gap="3">
        {errorMessage && (
          <Callout.Root color="red">
            <Callout.Text>{errorMessage}</Callout.Text>
          </Callout.Root>
        )}
        <Card style={{ padding: '0.5rem' }}>
          <Flex align="center" justify="between" gap="2" wrap="wrap" style={{ margin: 0, padding: 0 }}>
            <Flex gap="2" wrap="wrap" style={{ margin: 0, padding: 0, flex: 1 }}>
              {Object.entries(connectionStatus)
                .filter(([app]) => app !== 'scheduler') // Exclude scheduler from connection status
                .map(([app, status]: [string, any]) => {
                  // Format display name - handle instance IDs
                  let displayName = app;
                  if (app.includes('-') && app !== 'radarr' && app !== 'sonarr') {
                    // It's an instance ID, use instanceName from status or construct from app type
                    if (status.instanceName) {
                      displayName = status.instanceName;
                    } else {
                      // Extract app type from ID (e.g., "sonarr-1766427071907" -> "Sonarr")
                      const appType = app.split('-')[0];
                      const instanceNum = status.instanceId || app.split('-').slice(1)[0]?.substring(0, 1) || '1';
                      displayName = `${appType.charAt(0).toUpperCase() + appType.slice(1)} ${instanceNum}`;
                    }
                  } else {
                    displayName = app.charAt(0).toUpperCase() + app.slice(1);
                  }
                  
                  // Determine status message
                  let statusMessage = 'Disconnected';
                  let badgeColor: 'green' | 'gray' | 'red' = 'red';
                  
                  if (status.connected) {
                    statusMessage = 'Connected';
                    badgeColor = 'green';
                  } else if (status.configured === false) {
                    statusMessage = 'Not Configured';
                    badgeColor = 'gray';
                  }
                  
                  return (
                    <Badge 
                      key={app} 
                      color={badgeColor}
                      size="2"
                    >
                      {displayName}: {statusMessage}
                    </Badge>
                  );
                })}
              {/* Display scheduler status separately */}
              {schedulerStatus && (
                <Badge 
                  color={schedulerStatus.enabled && schedulerStatus.running ? 'green' : schedulerStatus.enabled ? 'yellow' : 'gray'}
                  size="2"
                >
                  Scheduler: {schedulerStatus.enabled && schedulerStatus.running ? 'Running' : schedulerStatus.enabled ? 'Enabled' : 'Disabled'}
                </Badge>
              )}
            </Flex>
          </Flex>
        </Card>

        {stats && (() => {
          // Calculate Radarr and Sonarr totals from upgradesByInstance
          let radarrTotal = 0;
          let sonarrTotal = 0;
          
          Object.entries(stats.upgradesByInstance || {}).forEach(([instanceKey, count]) => {
            if (instanceKey.startsWith('radarr')) {
              radarrTotal += count as number;
            } else if (instanceKey.startsWith('sonarr')) {
              sonarrTotal += count as number;
            }
          });
          
          // Fallback to upgradesByApplication if upgradesByInstance is empty
          if (radarrTotal === 0 && sonarrTotal === 0) {
            radarrTotal = stats.upgradesByApplication?.radarr || 0;
            sonarrTotal = stats.upgradesByApplication?.sonarr || 0;
          }
          
          return (
            <Card>
              <Flex direction="column" gap="3">
                <Flex align="center" justify="between">
                  <Heading size="5">Upgrade Statistics</Heading>
                  {confirmingClear === 'stats' ? (
                    <Flex gap="2" align="center">
                      <Text size="2" color="gray">Are you sure?</Text>
                      <Button 
                        variant="solid" 
                        color="red"
                        size="2" 
                        onClick={handleClearStats}
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
                  ) : (
                    <Button 
                      variant="outline" 
                      color="red"
                      size="2" 
                      onClick={() => setConfirmingClear('stats')}
                    >
                      Clear Stats
                    </Button>
                  )}
                </Flex>
                <Separator />
                <Flex gap="3" wrap="wrap" justify="center">
                  <Card variant="surface" style={{ flex: '1 1 200px', minWidth: '150px' }}>
                    <Flex direction="column" gap="2" align="center" justify="center">
                      <Text size="2" color="gray" style={{ textAlign: 'center' }}>Radarr</Text>
                      <Heading size="7" style={{ textAlign: 'center' }}>{radarrTotal}</Heading>
                    </Flex>
                  </Card>
                  <Card variant="surface" style={{ flex: '1 1 200px', minWidth: '150px' }}>
                    <Flex direction="column" gap="2" align="center" justify="center">
                      <Text size="2" color="gray" style={{ textAlign: 'center' }}>Total Upgrades</Text>
                      <Heading size="7" style={{ textAlign: 'center' }}>{stats.totalUpgrades}</Heading>
                    </Flex>
                  </Card>
                  <Card variant="surface" style={{ flex: '1 1 200px', minWidth: '150px' }}>
                    <Flex direction="column" gap="2" align="center" justify="center">
                      <Text size="2" color="gray" style={{ textAlign: 'center' }}>Sonarr</Text>
                      <Heading size="7" style={{ textAlign: 'center' }}>{sonarrTotal}</Heading>
                    </Flex>
                  </Card>
                </Flex>
                {stats.lastUpgrade && (
                  <Text size="2" color="gray">
                    Last upgrade: {formatDate(stats.lastUpgrade)}
                  </Text>
                )}
              </Flex>
            </Card>
          );
        })()}

        {renderAutomaticRunPreview()}

        {(() => {
          const recentUpgrades = stats?.recentUpgrades || [];
          const totalItems = recentUpgrades.length;
          const totalPages = Math.ceil(totalItems / itemsPerPage);
          const startIndex = (currentPage - 1) * itemsPerPage;
          const endIndex = startIndex + itemsPerPage;
          const currentItems = recentUpgrades.slice(startIndex, endIndex);
          
          return (
            <Card>
              <Flex direction="column" gap="2">
                <Flex align="center" justify="between">
                  <Heading size="5">Recent Upgrades</Heading>
                  <Flex gap="2" align="center">
                    {totalItems > 0 && (
                      <Text size="2" color="gray">
                        Page {currentPage} of {totalPages} ({totalItems} total)
                      </Text>
                    )}
                    {totalItems > 0 && (
                      confirmingClear === 'recent' ? (
                        <Flex gap="2" align="center">
                          <Text size="2" color="gray">Are you sure?</Text>
                          <Button 
                            variant="solid" 
                            color="red"
                            size="2" 
                            onClick={handleClearRecentUpgrades}
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
                      ) : (
                        <Button 
                          variant="outline" 
                          color="red"
                          size="2" 
                          onClick={() => setConfirmingClear('recent')}
                        >
                          Clear Recent
                        </Button>
                      )
                    )}
                  </Flex>
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
                        const dateStr = timestamp.toLocaleDateString();
                        const timeStr = timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
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
                              borderBottom: idx < currentItems.length - 1 ? '1px solid var(--gray-6)' : 'none'
                            }}
                          >
                            <Badge size="1" style={{ textTransform: 'capitalize', minWidth: '60px', textAlign: 'center' }}>
                              {appName}
                            </Badge>
                            <Text size="2" weight="medium" style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {itemsPreview}
                            </Text>
                            <Text size="1" color="gray" style={{ minWidth: '60px', textAlign: 'right' }}>
                              {dateStr} {timeStr}
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
                        <Flex gap="1" align="center">
                          {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
                            <Button
                              key={page}
                              variant={currentPage === page ? "solid" : "outline"}
                              size="2"
                              onClick={() => setCurrentPage(page)}
                              style={{ minWidth: '2.5rem' }}
                            >
                              {page}
                            </Button>
                          ))}
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
      </Flex>
    </div>
  );
}

export default Dashboard;

