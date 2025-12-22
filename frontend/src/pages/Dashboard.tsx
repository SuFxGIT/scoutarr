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
import { PlayIcon, ReloadIcon, CheckIcon, CrossCircledIcon } from '@radix-ui/react-icons';
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
  const [automaticRunResults, setAutomaticRunResults] = useState<SearchResults | null>(null);
  const [manualRunResults, setManualRunResults] = useState<SearchResults | null>(null);
  const [lastRunResults, setLastRunResults] = useState<SearchResults | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<Record<string, any>>({});
  const [stats, setStats] = useState<Stats | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [logHistory, setLogHistory] = useState<Array<{ timestamp: string; app: string; message: string; type: 'success' | 'error' | 'info' }>>([]);
  const [autoScroll, setAutoScroll] = useState(true);
  const [schedulerStatus, setSchedulerStatus] = useState<{ enabled: boolean; running: boolean; schedule: string | null } | null>(null);
  const logContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadStatus();
    loadAutomaticRun();
    loadManualRun();
    loadStats();
  }, []);

  // Reload status when automatic run is refreshed to get latest scheduler status
  useEffect(() => {
    loadStatus();
  }, [automaticRunResults]);

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

  const loadAutomaticRun = async () => {
    try {
      const response = await axios.post('/api/search/automatic-run-preview');
      setAutomaticRunResults(response.data);
    } catch (error) {
      console.error('Failed to load automatic run preview:', error);
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

  const handleRun = async () => {
    setIsRunning(true);
    try {
      const response = await axios.post('/api/search/run');
      setLastRunResults(response.data);
      await loadManualRun(); // Refresh manual run preview after actual run
      await loadStats(); // Refresh stats after actual run
      setErrorMessage(null);
    } catch (error: any) {
      console.error('Search failed:', error);
      setErrorMessage('Search failed: ' + (error.response?.data?.error || error.message));
    } finally {
      setIsRunning(false);
    }
  };

  // Update log history when automatic run results change
  useEffect(() => {
    if (automaticRunResults) {
      const newLogs: Array<{ timestamp: string; app: string; message: string; type: 'success' | 'error' | 'info' }> = [];
      const timestamp = new Date().toLocaleTimeString();
      
      // Add scheduler status log
      const status = schedulerStatus?.enabled ? 'Enabled' : 'Disabled';
      newLogs.push({
        timestamp,
        app: 'Scheduler',
        message: `Scheduler Status: ${status}`,
        type: schedulerStatus?.enabled ? 'success' : 'info'
      });
      
      // Only show actions if scheduler is enabled
      if (schedulerStatus?.enabled) {
        Object.entries(automaticRunResults).forEach(([app, result]) => {
          if (result.success) {
            const count = result.count || 0;
            const appName = formatAppName(app);
            
            // Show triggered action
            newLogs.push({
              timestamp,
              app,
              message: `${appName}: Triggered`,
              type: 'success'
            });
            
            // Show searched items
            if (result.movies && result.movies.length > 0) {
              newLogs.push({
                timestamp,
                app,
                message: `${appName}: Searched ${result.movies.length} movies`,
                type: 'info'
              });
              result.movies.forEach(movie => {
                newLogs.push({
                  timestamp,
                  app,
                  message: `  → ${movie.title}`,
                  type: 'info'
                });
              });
            }
            if (result.series && result.series.length > 0) {
              newLogs.push({
                timestamp,
                app,
                message: `${appName}: Searched ${result.series.length} series`,
                type: 'info'
              });
              result.series.forEach(series => {
                newLogs.push({
                  timestamp,
                  app,
                  message: `  → ${series.title}`,
                  type: 'info'
                });
              });
            }
          } else {
            newLogs.push({
              timestamp,
              app,
              message: `${formatAppName(app)}: Error - ${result.error || 'Unknown error'}`,
              type: 'error'
            });
          }
        });
      }
      setLogHistory(prev => [...prev, ...newLogs]);
    }
  }, [automaticRunResults, schedulerStatus]);

  // Auto-scroll to bottom
  useEffect(() => {
    if (autoScroll && logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logHistory, autoScroll]);

  const renderAutomaticRunPreview = () => {

    return (
      <Card mb="4">
        <Flex align="center" justify="between" mb="3">
          <Heading size="5">Automatic Run Preview Window</Heading>
          <Flex gap="3">
            <Button 
              variant="outline" 
              size="3" 
              onClick={() => setLogHistory([])}
            >
              Clear History
            </Button>
            <Button 
              variant="outline" 
              size="3" 
              onClick={loadAutomaticRun}
            >
              <ReloadIcon /> Refresh Preview
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
            {logHistory.length === 0 ? (
              <Text size="2" color="gray" style={{ fontStyle: 'italic' }}>
                No logs yet. Click "Refresh Preview" to see what the scheduler would do.
              </Text>
            ) : (
              logHistory.map((log, idx) => (
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

  const renderResults = (results: SearchResults | null, title: string) => {
    if (!results) return null;

    return (
      <Card mb="4">
        <Flex align="center" justify="between" mb="3">
          <Heading size="5">{title}</Heading>
          {title === 'Manual Run' && (
            <Flex gap="3">
              <Button 
                size="3" 
                onClick={handleRun} 
                disabled={isRunning}
              >
                <PlayIcon /> {isRunning ? 'Running...' : 'Run Search'}
              </Button>
              <Button 
                variant="outline" 
                size="3" 
                onClick={loadManualRun}
              >
                <ReloadIcon /> Refresh Preview
              </Button>
            </Flex>
          )}
        </Flex>
        <Flex direction="column" gap="3">
          {Object.entries(results).map(([app, result]) => (
            <Card key={app} variant="surface">
              <Flex direction="column" gap="2">
                <Flex align="center" justify="between">
                  <Heading size="4" style={{ textTransform: 'capitalize' }}>{app}</Heading>
                  {result.success ? (
                    <Badge color="green">
                      <CheckIcon /> Success
                    </Badge>
                  ) : (
                    <Badge color="red">
                      <CrossCircledIcon /> Error
                    </Badge>
                  )}
                </Flex>
                {result.success ? (
                  <>
                    <Text size="2" color="gray">
                      {title === 'Manual Run' || title === 'Automatic Run Preview Window'
                        ? `Would search ${result.count} of ${result.total} items`
                        : `Searched ${result.searched} items`
                      }
                    </Text>
                    {result.movies && result.movies.length > 0 && (
                      <Flex direction="column" gap="1" mt="2">
                        <Text size="2" weight="bold">Movies:</Text>
                        {result.movies.map(movie => (
                          <Text key={movie.id} size="2">• {movie.title}</Text>
                        ))}
                      </Flex>
                    )}
                    {result.series && result.series.length > 0 && (
                      <Flex direction="column" gap="1" mt="2">
                        <Text size="2" weight="bold">Series:</Text>
                        {result.series.map(series => (
                          <Text key={series.id} size="2">• {series.title}</Text>
                        ))}
                      </Flex>
                    )}
                  </>
                ) : (
                  <Callout.Root color="red">
                    <Callout.Text>{result.error || 'Unknown error'}</Callout.Text>
                  </Callout.Root>
                )}
              </Flex>
            </Card>
          ))}
        </Flex>
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
        <Card>
          <Flex direction="column" gap="3">
            <Flex align="center" justify="between">
              <Heading size="5">Connection Status</Heading>
              <Button variant="ghost" size="2" onClick={loadStatus}>
                <ReloadIcon /> Refresh
              </Button>
            </Flex>
            <Separator />
            <Flex gap="3" wrap="wrap">
              {Object.entries(connectionStatus).map(([app, status]: [string, any]) => {
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
                  <Button variant="ghost" size="2" onClick={loadStats}>
                    <ReloadIcon /> Refresh
                  </Button>
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
                {stats.recentUpgrades.length > 0 && (
                  <Flex direction="column" gap="2" mt="2">
                    <Text size="3" weight="bold">Recent Upgrades</Text>
                    <Flex direction="column" gap="1" style={{ maxHeight: '200px', overflowY: 'auto' }}>
                      {stats.recentUpgrades.slice(0, 10).map((upgrade, idx) => (
                        <Card key={idx} variant="surface" size="1">
                          <Flex direction="column" gap="1">
                            <Flex align="center" justify="between">
                              <Badge size="1" style={{ textTransform: 'capitalize' }}>
                                {upgrade.instance 
                                  ? `${upgrade.application} (${upgrade.instance})`
                                  : upgrade.application}
                              </Badge>
                              <Text size="1" color="gray">{formatDate(upgrade.timestamp)}</Text>
                            </Flex>
                            <Text size="2">
                              {upgrade.count} {upgrade.count === 1 ? 'item' : 'items'} upgraded
                            </Text>
                            {upgrade.items.length > 0 && (
                              <Text size="1" color="gray" style={{ fontStyle: 'italic' }}>
                                {upgrade.items.slice(0, 3).map(i => i.title).join(', ')}
                                {upgrade.items.length > 3 && ` +${upgrade.items.length - 3} more`}
                              </Text>
                            )}
                          </Flex>
                        </Card>
                      ))}
                    </Flex>
                  </Flex>
                )}
              </Flex>
            </Card>
          );
        })()}

        {renderAutomaticRunPreview()}
        {renderResults(manualRunResults, 'Manual Run')}
        {renderResults(lastRunResults, 'Last Run Results')}
      </Flex>
    </div>
  );
}

export default Dashboard;

