import { useState, useEffect } from 'react';
import { 
  Flex, 
  Container, 
  Heading, 
  Button, 
  Card, 
  Text, 
  Badge,
  Separator,
  AlertDialog,
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
  const [dryRunResults, setDryRunResults] = useState<SearchResults | null>(null);
  const [lastRunResults, setLastRunResults] = useState<SearchResults | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<Record<string, any>>({});
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    loadStatus();
    loadDryRun();
    loadStats();
  }, []);

  const loadStatus = async () => {
    try {
      const response = await axios.get('/api/status');
      setConnectionStatus(response.data);
    } catch (error) {
      console.error('Failed to load status:', error);
    }
  };

  const loadDryRun = async () => {
    try {
      const response = await axios.post('/api/search/dry-run'); // Manual Run
      setDryRunResults(response.data);
    } catch (error) {
      console.error('Failed to load dry run:', error);
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
      await loadDryRun(); // Refresh dry run after actual run
      await loadStats(); // Refresh stats after actual run
    } catch (error: any) {
      console.error('Search failed:', error);
      alert('Search failed: ' + (error.response?.data?.error || error.message));
    } finally {
      setIsRunning(false);
    }
  };

  const renderResults = (results: SearchResults | null, title: string) => {
    if (!results) return null;

    return (
      <Card mb="4">
        <Heading size="5" mb="3">{title}</Heading>
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
                      {title === 'Manual Run' 
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

        {stats && (
          <Card>
            <Flex direction="column" gap="3">
              <Flex align="center" justify="between">
                <Heading size="5">Upgrade Statistics</Heading>
                <Button variant="ghost" size="2" onClick={loadStats}>
                  <ReloadIcon /> Refresh
                </Button>
              </Flex>
              <Separator />
              <Flex gap="3" wrap="wrap">
                <Card variant="surface" style={{ flex: '1 1 200px', minWidth: '150px' }}>
                  <Flex direction="column" gap="2">
                    <Text size="2" color="gray">Total Upgrades</Text>
                    <Heading size="7">{stats.totalUpgrades}</Heading>
                  </Flex>
                </Card>
                {Object.entries(stats.upgradesByInstance || {}).map(([instanceKey, count]) => {
                  const [app, instance] = instanceKey.includes('-') 
                    ? instanceKey.split('-').slice(0, 2)
                    : [instanceKey, undefined];
                  const displayName = instance 
                    ? `${app.charAt(0).toUpperCase() + app.slice(1)} (${instance})`
                    : app.charAt(0).toUpperCase() + app.slice(1);
                  return (
                    <Card key={instanceKey} variant="surface" style={{ flex: '1 1 200px', minWidth: '150px' }}>
                      <Flex direction="column" gap="2">
                        <Text size="2" color="gray">{displayName}</Text>
                        <Heading size="7">{count}</Heading>
                      </Flex>
                    </Card>
                  );
                })}
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
        )}

        <Card>
          <Flex direction="column" gap="3">
            <Flex align="center" justify="between">
              <Heading size="5">Actions</Heading>
            </Flex>
            <Separator />
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
                onClick={loadDryRun}
              >
                <ReloadIcon /> Refresh Preview
              </Button>
            </Flex>
          </Flex>
        </Card>

        {renderResults(dryRunResults, 'Manual Run')}
        {renderResults(lastRunResults, 'Last Run Results')}
      </Flex>
    </div>
  );
}

export default Dashboard;

