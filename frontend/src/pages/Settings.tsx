import { useState, useEffect } from 'react';
import {
  Flex,
  Heading,
  Button,
  Card,
  TextField,
  Text,
  Select,
  Switch,
  Separator,
  Tabs,
  Callout,
  Badge,
  Spinner,
  Grid,
  Tooltip
} from '@radix-ui/themes';
import * as Collapsible from '@radix-ui/react-collapsible';
import { CheckIcon, CrossCircledIcon, PlusIcon, TrashIcon, ChevronDownIcon, ChevronRightIcon } from '@radix-ui/react-icons';
import axios from 'axios';
import type { Config } from '../types/config';

function Settings() {
  const [config, setConfig] = useState<Config | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testResults, setTestResults] = useState<Record<string, { status: boolean | null; testing: boolean }>>({});
  const [saveMessage, setSaveMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [schedulerPreset, setSchedulerPreset] = useState<string>('custom');
  const [activeTab, setActiveTab] = useState<string>('radarr');
  const [expandedInstances, setExpandedInstances] = useState<Set<string>>(new Set());
  const [removeInstanceError, setRemoveInstanceError] = useState<string | null>(null);

  const cronPresets: Record<string, string> = {
    'every-10-min': '*/10 * * * *',
    'every-30-min': '*/30 * * * *',
    'every-hour': '0 * * * *',
    'every-6-hours': '0 */6 * * *',
    'every-12-hours': '0 */12 * * *',
    'daily-midnight': '0 0 * * *',
    'daily-noon': '0 12 * * *',
    'twice-daily': '0 0,12 * * *',
    'weekly-sunday': '0 0 * * 0',
    'custom': ''
  };

  const getPresetFromSchedule = (schedule: string): string => {
    for (const [preset, cron] of Object.entries(cronPresets)) {
      if (cron === schedule) {
        return preset;
      }
    }
    return 'custom';
  };

  useEffect(() => {
    loadConfig();
    
    // Reload config when page becomes visible (handles refresh)
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && !loading && !saving) {
        loadConfig();
      }
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);

  const loadConfig = async () => {
    setLoading(true);
    try {
      const response = await axios.get('/api/config');
      const normalizedConfig = normalizeConfig(response.data);
      setConfig(normalizedConfig);
      if (normalizedConfig.scheduler?.schedule) {
        setSchedulerPreset(getPresetFromSchedule(normalizedConfig.scheduler.schedule));
      }
      setSaveMessage(null);
    } catch (error: any) {
      console.error('Failed to load config:', error);
      setSaveMessage({
        type: 'error',
        text: 'Failed to load configuration. Please refresh the page.'
      });
    } finally {
      setLoading(false);
    }
  };

  const saveConfig = async () => {
    if (!config) return;
    setSaving(true);
    setSaveMessage(null);
    try {
      await axios.put('/api/config', config);
      setSaveMessage({ type: 'success', text: 'Configuration saved successfully!' });
      // Reload config to ensure we have the latest from server
      await loadConfig();
    } catch (error: any) {
      setSaveMessage({
        type: 'error',
        text: 'Failed to save config: ' + (error.response?.data?.error || error.message)
      });
    } finally {
      setSaving(false);
    }
  };


  // Helper to get next available instance ID
  const getNextInstanceId = (_app: 'radarr' | 'sonarr', instances: any[]): number => {
    const existingIds = instances
      .map(inst => inst.instanceId)
      .filter(id => typeof id === 'number')
      .sort((a, b) => a - b);
    
    // Find the first gap or next number
    for (let i = 1; i <= existingIds.length + 1; i++) {
      if (!existingIds.includes(i)) {
        return i;
      }
    }
    return existingIds.length + 1;
  };

  // Helper to normalize config - convert single instance to array format
  const normalizeConfig = (config: Config): Config => {
    const normalized = { ...config };
    
    // Convert Radarr to array if it's a single instance
    if (normalized.applications.radarr && !Array.isArray(normalized.applications.radarr)) {
      const radarr = normalized.applications.radarr as any;
      normalized.applications.radarr = [{
        id: 'radarr-1',
        instanceId: 1,
        name: '',
        ...radarr
      }];
    } else if (Array.isArray(normalized.applications.radarr)) {
      // Ensure all instances have instanceId
      normalized.applications.radarr = normalized.applications.radarr.map((inst: any, idx: number) => ({
        ...inst,
        instanceId: inst.instanceId || idx + 1
      }));
    }
    
    // Convert Sonarr to array if it's a single instance
    if (normalized.applications.sonarr && !Array.isArray(normalized.applications.sonarr)) {
      const sonarr = normalized.applications.sonarr as any;
      normalized.applications.sonarr = [{
        id: 'sonarr-1',
        instanceId: 1,
        name: '',
        ...sonarr
      }];
    } else if (Array.isArray(normalized.applications.sonarr)) {
      // Ensure all instances have instanceId
      normalized.applications.sonarr = normalized.applications.sonarr.map((inst: any, idx: number) => ({
        ...inst,
        instanceId: inst.instanceId || idx + 1
      }));
    }
    
    return normalized;
  };

  // Get instances for an app (handles both array and single)
  const getInstances = (app: 'radarr' | 'sonarr'): any[] => {
    if (!config) return [];
    const appConfig = config.applications[app];
    if (Array.isArray(appConfig)) {
      return appConfig;
    }
    // Legacy single instance - convert to array
    return [{
      id: `${app}-1`,
      instanceId: 1,
      name: '',
      ...appConfig
    }];
  };

  // Update instance config
  const updateInstanceConfig = (app: 'radarr' | 'sonarr', instanceId: string, field: string, value: any) => {
    if (!config) return;
    const instances = getInstances(app);
    const updatedInstances = instances.map(inst => 
      inst.id === instanceId ? { ...inst, [field]: value } : inst
    );
    
    setConfig({
      ...config,
      applications: {
        ...config.applications,
        [app]: updatedInstances
      }
    });
    
    // Clear test result when config changes
    if (field === 'url' || field === 'apiKey') {
      setTestResults(prev => ({
        ...prev,
        [`${app}-${instanceId}`]: { status: null, testing: false }
      }));
    }
  };

  // Add new instance
  const addInstance = (app: 'radarr' | 'sonarr') => {
    if (!config) return;
    const instances = getInstances(app);
    // Limit to 4 instances per app
    if (instances.length >= 4) {
      alert(`Maximum of 4 ${app.charAt(0).toUpperCase() + app.slice(1)} instances allowed.`);
      return;
    }
    const newId = `${app}-${Date.now()}`;
    const nextInstanceId = getNextInstanceId(app, instances);
    const defaultConfig = app === 'radarr' ? {
      id: newId,
      instanceId: nextInstanceId,
      name: '',
      url: '',
      apiKey: '',
      count: 10,
      tagName: 'upgradinatorr',
      ignoreTag: '',
      monitored: true,
      movieStatus: 'released' as const,
      qualityProfileName: '',
      enabled: true
    } : {
      id: newId,
      instanceId: nextInstanceId,
      name: '',
      url: '',
      apiKey: '',
      count: 5,
      tagName: 'upgradinatorr',
      ignoreTag: '',
      monitored: true,
      seriesStatus: '',
      qualityProfileName: '',
      enabled: true
    };
    
    setConfig({
      ...config,
      applications: {
        ...config.applications,
        [app]: [...instances, defaultConfig]
      }
    });
  };

  // Remove instance
  const removeInstance = (app: 'radarr' | 'sonarr', instanceId: string) => {
    if (!config) return;
    const instances = getInstances(app);
    if (instances.length <= 1) {
      setRemoveInstanceError('You must have at least one instance');
      setTimeout(() => setRemoveInstanceError(null), 5000);
      return;
    }
    setRemoveInstanceError(null);
    const updatedInstances = instances.filter(inst => inst.id !== instanceId);
    setConfig({
      ...config,
      applications: {
        ...config.applications,
        [app]: updatedInstances
      }
    });
  };

  const updateNotificationConfig = (field: string, value: string) => {
    if (!config) return;
    setConfig({
      ...config,
      notifications: {
        ...config.notifications,
        [field]: value
      }
    });
  };

  if (loading) {
    return (
      <Flex align="center" justify="center" gap="3" style={{ padding: '2rem' }}>
        <Spinner size="3" />
        <Text>Loading configuration...</Text>
      </Flex>
    );
  }

  if (!config) {
    return (
      <Callout.Root color="red" style={{ padding: '2rem' }}>
        <Callout.Text>Failed to load configuration</Callout.Text>
        <Callout.Text size="1" style={{ marginTop: '0.5rem' }}>
          <Button size="2" variant="soft" onClick={loadConfig}>
            Retry
          </Button>
        </Callout.Text>
      </Callout.Root>
    );
  }

  const renderTestButton = (app: string, instanceId?: string) => {
    const key = instanceId ? `${app}-${instanceId}` : app;
    const testResult = testResults[key];
    let appConfig: any;
    if (instanceId && Array.isArray(config.applications[app as 'radarr' | 'sonarr'])) {
      const instances = config.applications[app as 'radarr' | 'sonarr'] as any[];
      appConfig = instances.find(inst => inst.id === instanceId);
    } else {
      appConfig = config.applications[app as keyof Config['applications']];
    }
    const canTest = appConfig?.url && appConfig?.apiKey;

    return (
      <Flex gap="3" align="center">
        <Button
          variant="outline"
          onClick={() => testConnection(app, instanceId)}
          disabled={!canTest || testResult?.testing}
        >
          {testResult?.testing ? (
            <>
              <Spinner size="1" /> Testing...
            </>
          ) : (
            'Test Connection'
          )}
        </Button>
        {testResult?.status !== null && testResult?.status !== undefined && !testResult.testing && (
          <Badge color={testResult.status ? 'green' : 'red'}>
            {testResult.status ? <CheckIcon /> : <CrossCircledIcon />}
            {testResult.status ? 'Connected' : 'Failed'}
          </Badge>
        )}
        {!canTest && (
          <Text size="2" color="gray">
            Configure URL and API Key first
          </Text>
        )}
      </Flex>
    );
  };

  const testConnection = async (app: string, instanceId?: string) => {
    if (!config) return;
    const key = instanceId ? `${app}-${instanceId}` : app;
    let appConfig: any;
    if (instanceId && Array.isArray(config.applications[app as 'radarr' | 'sonarr'])) {
      const instances = config.applications[app as 'radarr' | 'sonarr'] as any[];
      appConfig = instances.find(inst => inst.id === instanceId);
    } else {
      appConfig = config.applications[app as keyof Config['applications']];
    }
    if (!appConfig || !appConfig.url || !appConfig.apiKey) {
      setTestResults(prev => ({
        ...prev,
        [key]: { status: false, testing: false }
      }));
      return;
    }

    // Set testing state
    setTestResults(prev => ({
      ...prev,
      [key]: { status: null, testing: true }
    }));

    try {
      // Send current local config values to test endpoint
      const response = await axios.post(`/api/config/test/${app}`, {
        url: appConfig.url,
        apiKey: appConfig.apiKey
      });
      setTestResults(prev => ({
        ...prev,
        [key]: { status: response.data.success === true, testing: false }
      }));
    } catch (error: any) {
      setTestResults(prev => ({
        ...prev,
        [key]: { status: false, testing: false }
      }));
    }
  };

  return (
    <div style={{ width: '100%', paddingTop: 0, marginTop: 0 }}>
      <Flex direction="column" gap="3">
        <Callout.Root color="blue">
          <Callout.Text>
            <Text weight="bold" size="3">What is Scoutarr?</Text>
            <br />
            <Text size="2">
              Scoutarr automates media upgrades in your Starr applications (Radarr, Sonarr, etc.) by triggering manual searches for media items that meet your criteria. 
              It helps find better quality versions of your media by searching both forward and backward, unlike the automatic search which only looks forward.
            </Text>
          </Callout.Text>
        </Callout.Root>

        {saveMessage && (
          <Callout.Root color={saveMessage.type === 'success' ? 'green' : 'red'}>
            <Callout.Text>{saveMessage.text}</Callout.Text>
          </Callout.Root>
        )}

        {removeInstanceError && (
          <Callout.Root color="red" size="1">
            <Callout.Text>{removeInstanceError}</Callout.Text>
          </Callout.Root>
        )}

        <Callout.Root color="blue" size="1">
          <Callout.Text>
            <Text size="1">💡 Hover over input fields to see descriptions and hints</Text>
          </Callout.Text>
        </Callout.Root>

        <Tabs.Root value={activeTab} onValueChange={setActiveTab}>
          <Flex align="center" justify="between" gap="3">
            <Tabs.List>
              <Tabs.Trigger value="radarr">Radarr</Tabs.Trigger>
              <Tabs.Trigger value="sonarr">Sonarr</Tabs.Trigger>
              <Tabs.Trigger value="notifications">Notifications</Tabs.Trigger>
              <Tabs.Trigger value="scheduler">Scheduler</Tabs.Trigger>
            </Tabs.List>
            <Button size="3" onClick={saveConfig} disabled={saving || loading}>
              {saving ? (
                <>
                  <Spinner size="1" /> Saving...
                </>
              ) : (
                'Save Configuration'
              )}
            </Button>
          </Flex>

          <Tabs.Content value="radarr" style={{ paddingTop: '1rem' }}>
            <Flex direction="column" gap="3">
              <Flex align="center" justify="between">
                <Heading size="5">Radarr</Heading>
                <Button 
                  onClick={() => addInstance('radarr')}
                  disabled={getInstances('radarr').length >= 4}
                >
                  <PlusIcon /> Add
                </Button>
              </Flex>
              
              <Grid columns={{ initial: '1', md: '2' }} gap="3">
                {getInstances('radarr').map((instance, idx) => {
                  const instanceKey = `radarr-${instance.id}`;
                  const isExpanded = expandedInstances.has(instanceKey);
                  const displayName = instance.name || `Radarr ${instance.instanceId || idx + 1}`;
                  
                  return (
                    <Card key={instance.id} style={{ alignSelf: 'flex-start', width: '100%' }}>
                      <Flex direction="column" gap="2">
                        <Collapsible.Root open={isExpanded} onOpenChange={(open) => {
                          const newExpanded = new Set(expandedInstances);
                          if (open) {
                            newExpanded.add(instanceKey);
                          } else {
                            newExpanded.delete(instanceKey);
                          }
                          setExpandedInstances(newExpanded);
                        }}>
                          <Collapsible.Trigger asChild>
                            <div 
                              style={{ 
                                width: '100%', 
                                display: 'flex', 
                                justifyContent: 'space-between', 
                                alignItems: 'center', 
                                padding: '0.75rem', 
                                marginBottom: '0', 
                                cursor: 'pointer',
                                userSelect: 'none',
                                WebkitUserSelect: 'none'
                              }}
                              onClick={(e) => e.stopPropagation()}
                            >
                              <Flex align="center" gap="2" style={{ width: '100%', justifyContent: 'space-between' }}>
                                <Text size="3" weight="bold">{displayName}</Text>
                                <Flex align="center" gap="2">
                                  {getInstances('radarr').length > 1 && (
                                    <Button 
                                      variant="soft" 
                                      color="red" 
                                      size="1"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        removeInstance('radarr', instance.id);
                                      }}
                                    >
                                      <TrashIcon />
                                    </Button>
                                  )}
                                  {isExpanded ? <ChevronDownIcon /> : <ChevronRightIcon />}
                                </Flex>
                              </Flex>
                            </div>
                          </Collapsible.Trigger>
                          
                          <Collapsible.Content style={{ overflow: 'hidden' }}>
                            <Flex direction="column" gap="3" p="3" pt="2">
                              <Flex direction="row" align="center" justify="between" gap="2">
                                <Text size="2" weight="medium">Enable Instance</Text>
                                <Tooltip content="When enabled, this instance will be included in search operations. When disabled, it will be skipped.">
                                  <span>
                                    <Switch
                                      checked={instance.enabled !== false}
                                      onCheckedChange={(checked) => updateInstanceConfig('radarr', instance.id, 'enabled', checked)}
                                    />
                                  </span>
                                </Tooltip>
                              </Flex>
                              <Separator />
                              <Flex direction="column" gap="2">
                                <Text size="2" weight="medium">Name (optional)</Text>
                                <Tooltip content="A friendly name to identify this instance (e.g., 'Main Radarr', '4K Radarr'). Leave empty to use default ID.">
                                  <TextField.Root
                                    value={instance.name || ''}
                                    onChange={(e) => updateInstanceConfig('radarr', instance.id, 'name', e.target.value)}
                                    placeholder={`Radarr ${instance.instanceId || idx + 1}`}
                                  />
                                </Tooltip>
                              </Flex>

                              <Flex direction="column" gap="2">
                                <Text size="2" weight="medium">Radarr URL</Text>
                                <Tooltip content="The base URL where your Radarr instance is accessible (e.g., http://localhost:7878 or https://radarr.example.com)">
                                  <TextField.Root
                                    placeholder="http://localhost:7878"
                                    value={instance.url || ''}
                                    onChange={(e) => updateInstanceConfig('radarr', instance.id, 'url', e.target.value)}
                                  />
                                </Tooltip>
                              </Flex>

                              <Flex direction="column" gap="2">
                                <Text size="2" weight="medium">API Key</Text>
                                <Tooltip content="Your Radarr API key found in Settings → General → Security → API Key (must be 32 characters)">
                                  <TextField.Root
                                    type="password"
                                    placeholder="API Key"
                                    value={instance.apiKey || ''}
                                    onChange={(e) => updateInstanceConfig('radarr', instance.id, 'apiKey', e.target.value)}
                                  />
                                </Tooltip>
                              </Flex>

                              {renderTestButton('radarr', instance.id)}

                              <Flex direction="column" gap="2">
                                <Text size="2" weight="medium">Number of Movies to Search</Text>
                                <Tooltip content="How many movies to randomly select and search for upgrades each time the script runs. Use 'max' to search all matching movies.">
                                  <TextField.Root
                                    type="number"
                                    value={(instance.count || 10).toString()}
                                    onChange={(e) => updateInstanceConfig('radarr', instance.id, 'count', parseInt(e.target.value) || 10)}
                                  />
                                </Tooltip>
                              </Flex>

                              <Flex direction="column" gap="2">
                                <Text size="2" weight="medium">Tag Name</Text>
                                <Tooltip content="The tag name to use for tracking which movies have been searched. This tag will be created automatically if it doesn't exist.">
                                  <TextField.Root
                                    value={instance.tagName || ''}
                                    onChange={(e) => updateInstanceConfig('radarr', instance.id, 'tagName', e.target.value)}
                                  />
                                </Tooltip>
                              </Flex>

                              <Flex direction="column" gap="2">
                                <Text size="2" weight="medium">Ignore Tag (optional)</Text>
                                <Tooltip content="Movies with this tag will be excluded from upgrade searches. Leave empty to include all movies matching other criteria.">
                                  <TextField.Root
                                    value={instance.ignoreTag || ''}
                                    onChange={(e) => updateInstanceConfig('radarr', instance.id, 'ignoreTag', e.target.value)}
                                  />
                                </Tooltip>
                              </Flex>

                              <Flex direction="row" align="center" justify="between" gap="2">
                                <Text size="2" weight="medium">Search Monitored Movies Only</Text>
                                <Tooltip content="When enabled, only movies that are currently monitored will be considered for upgrades.">
                                  <span>
                                    <Switch
                                      checked={instance.monitored ?? true}
                                      onCheckedChange={(checked) => updateInstanceConfig('radarr', instance.id, 'monitored', checked)}
                                    />
                                  </span>
                                </Tooltip>
                              </Flex>

                              <Flex direction="column" gap="2">
                                <Text size="2" weight="medium">Minimum Movie Status</Text>
                                <Tooltip content="Only movies with this status or higher will be considered for upgrades. Released is recommended for most use cases.">
                                  <Select.Root
                                    value={instance.movieStatus || 'released'}
                                    onValueChange={(value) => updateInstanceConfig('radarr', instance.id, 'movieStatus', value)}
                                  >
                                    <Select.Trigger />
                                    <Select.Content position="popper" sideOffset={5}>
                                      <Select.Item value="announced">Announced</Select.Item>
                                      <Select.Item value="in cinemas">In Cinemas</Select.Item>
                                      <Select.Item value="released">Released</Select.Item>
                                    </Select.Content>
                                  </Select.Root>
                                </Tooltip>
                              </Flex>

                              <Flex direction="column" gap="2">
                                <Text size="2" weight="medium">Quality Profile Name (optional)</Text>
                                <Tooltip content="Only movies using this specific quality profile will be considered. Leave empty to include all quality profiles.">
                                  <TextField.Root
                                    value={instance.qualityProfileName || ''}
                                    onChange={(e) => updateInstanceConfig('radarr', instance.id, 'qualityProfileName', e.target.value)}
                                  />
                                </Tooltip>
                              </Flex>

                              <Separator />

                              <Flex direction="row" align="center" justify="between" gap="2">
                                <Text size="2" weight="medium">Clear Tags</Text>
                                <Tooltip content="Removes the configured tag from all movies in this Radarr instance. This is useful for resetting the upgrade process or clearing tags from all media at once.">
                                  <Button
                                    variant="outline"
                                    size="2"
                                    color="red"
                                    onClick={async () => {
                                      try {
                                        await axios.post(`/api/config/clear-tags/radarr/${instance.id}`);
                                      } catch (error: any) {
                                        console.error('Failed to clear tags:', error);
                                      }
                                    }}
                                  >
                                    Clear Tags
                                  </Button>
                                </Tooltip>
                              </Flex>
                            </Flex>
                          </Collapsible.Content>
                        </Collapsible.Root>
                      </Flex>
                    </Card>
                  );
                })}
              </Grid>
            </Flex>
          </Tabs.Content>

          <Tabs.Content value="sonarr" style={{ paddingTop: '1rem' }}>
            <Flex direction="column" gap="3">
              <Flex align="center" justify="between">
                <Heading size="5">Sonarr</Heading>
                <Button 
                  onClick={() => addInstance('sonarr')}
                  disabled={getInstances('sonarr').length >= 4}
                >
                  <PlusIcon /> Add
                </Button>
              </Flex>
              
              <Grid columns={{ initial: '1', md: '2' }} gap="3">
                {getInstances('sonarr').map((instance, idx) => {
                  const instanceKey = `sonarr-${instance.id}`;
                  const isExpanded = expandedInstances.has(instanceKey);
                  const displayName = instance.name || `Sonarr ${instance.instanceId || idx + 1}`;
                  
                  return (
                    <Card key={instance.id} style={{ alignSelf: 'flex-start', width: '100%' }}>
                      <Flex direction="column" gap="2">
                        <Collapsible.Root open={isExpanded} onOpenChange={(open) => {
                          const newExpanded = new Set(expandedInstances);
                          if (open) {
                            newExpanded.add(instanceKey);
                          } else {
                            newExpanded.delete(instanceKey);
                          }
                          setExpandedInstances(newExpanded);
                        }}>
                          <Collapsible.Trigger asChild>
                            <div 
                              style={{ 
                                width: '100%', 
                                display: 'flex', 
                                justifyContent: 'space-between', 
                                alignItems: 'center', 
                                padding: '0.75rem', 
                                marginBottom: '0', 
                                cursor: 'pointer',
                                userSelect: 'none',
                                WebkitUserSelect: 'none'
                              }}
                              onClick={(e) => e.stopPropagation()}
                            >
                              <Flex align="center" gap="2" style={{ width: '100%', justifyContent: 'space-between' }}>
                                <Text size="3" weight="bold">{displayName}</Text>
                                <Flex align="center" gap="2">
                                  {getInstances('sonarr').length > 1 && (
                                    <Button 
                                      variant="soft" 
                                      color="red" 
                                      size="1"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        removeInstance('sonarr', instance.id);
                                      }}
                                    >
                                      <TrashIcon />
                                    </Button>
                                  )}
                                  {isExpanded ? <ChevronDownIcon /> : <ChevronRightIcon />}
                                </Flex>
                              </Flex>
                            </div>
                          </Collapsible.Trigger>
                          
                          <Collapsible.Content style={{ overflow: 'hidden' }}>
                            <Flex direction="column" gap="3" p="3" pt="2">
                              <Flex direction="row" align="center" justify="between" gap="2">
                                <Text size="2" weight="medium">Enable Instance</Text>
                                <Tooltip content="When enabled, this instance will be included in search operations. When disabled, it will be skipped.">
                                  <span>
                                    <Switch
                                      checked={instance.enabled !== false}
                                      onCheckedChange={(checked) => updateInstanceConfig('sonarr', instance.id, 'enabled', checked)}
                                    />
                                  </span>
                                </Tooltip>
                              </Flex>
                              <Separator />
                              <Flex direction="column" gap="2">
                                <Text size="2" weight="medium">Name (optional)</Text>
                                <Tooltip content="A friendly name to identify this instance (e.g., 'Main Sonarr', 'Anime Sonarr'). Leave empty to use default ID.">
                                  <TextField.Root
                                    value={instance.name || ''}
                                    onChange={(e) => updateInstanceConfig('sonarr', instance.id, 'name', e.target.value)}
                                    placeholder={`Sonarr ${instance.instanceId || idx + 1}`}
                                  />
                                </Tooltip>
                              </Flex>

                              <Flex direction="column" gap="2">
                                <Text size="2" weight="medium">Sonarr URL</Text>
                                <Tooltip content="The base URL where your Sonarr instance is accessible (e.g., http://localhost:8989 or https://sonarr.example.com)">
                                  <TextField.Root
                                    placeholder="http://localhost:8989"
                                    value={instance.url || ''}
                                    onChange={(e) => updateInstanceConfig('sonarr', instance.id, 'url', e.target.value)}
                                  />
                                </Tooltip>
                              </Flex>

                              <Flex direction="column" gap="2">
                                <Text size="2" weight="medium">API Key</Text>
                                <Tooltip content="Your Sonarr API key found in Settings → General → Security → API Key (must be 32 characters)">
                                  <TextField.Root
                                    type="password"
                                    placeholder="API Key"
                                    value={instance.apiKey || ''}
                                    onChange={(e) => updateInstanceConfig('sonarr', instance.id, 'apiKey', e.target.value)}
                                  />
                                </Tooltip>
                              </Flex>

                              {renderTestButton('sonarr', instance.id)}

                              <Flex direction="column" gap="2">
                                <Text size="2" weight="medium">Number of Series to Search</Text>
                                <Tooltip content="How many series to randomly select and search for upgrades each time the script runs. Use 'max' to search all matching series.">
                                  <TextField.Root
                                    type="number"
                                    value={(instance.count || 5).toString()}
                                    onChange={(e) => updateInstanceConfig('sonarr', instance.id, 'count', parseInt(e.target.value) || 5)}
                                  />
                                </Tooltip>
                              </Flex>

                              <Flex direction="column" gap="2">
                                <Text size="2" weight="medium">Tag Name</Text>
                                <Tooltip content="The tag name to use for tracking which series have been searched. This tag will be created automatically if it doesn't exist.">
                                  <TextField.Root
                                    value={instance.tagName || ''}
                                    onChange={(e) => updateInstanceConfig('sonarr', instance.id, 'tagName', e.target.value)}
                                  />
                                </Tooltip>
                              </Flex>

                              <Flex direction="column" gap="2">
                                <Text size="2" weight="medium">Ignore Tag (optional)</Text>
                                <Tooltip content="Series with this tag will be excluded from upgrade searches. Leave empty to include all series matching other criteria.">
                                  <TextField.Root
                                    value={instance.ignoreTag || ''}
                                    onChange={(e) => updateInstanceConfig('sonarr', instance.id, 'ignoreTag', e.target.value)}
                                  />
                                </Tooltip>
                              </Flex>

                              <Flex direction="row" align="center" justify="between" gap="2">
                                <Text size="2" weight="medium">Search Monitored Series Only</Text>
                                <Tooltip content="When enabled, only series that are currently monitored will be considered for upgrades.">
                                  <span>
                                    <Switch
                                      checked={instance.monitored ?? true}
                                      onCheckedChange={(checked) => updateInstanceConfig('sonarr', instance.id, 'monitored', checked)}
                                    />
                                  </span>
                                </Tooltip>
                              </Flex>

                              <Flex direction="column" gap="2">
                                <Text size="2" weight="medium">Series Status (optional)</Text>
                                <Tooltip content="Only series with this status will be considered for upgrades. Leave as 'Any' to include all statuses.">
                                  <Select.Root
                                    value={instance.seriesStatus || 'any'}
                                    onValueChange={(value) => updateInstanceConfig('sonarr', instance.id, 'seriesStatus', value === 'any' ? '' : value)}
                                  >
                                    <Select.Trigger />
                                    <Select.Content position="popper" sideOffset={5}>
                                      <Select.Item value="any">Any</Select.Item>
                                      <Select.Item value="continuing">Continuing</Select.Item>
                                      <Select.Item value="upcoming">Upcoming</Select.Item>
                                      <Select.Item value="ended">Ended</Select.Item>
                                    </Select.Content>
                                  </Select.Root>
                                </Tooltip>
                              </Flex>

                              <Flex direction="column" gap="2">
                                <Text size="2" weight="medium">Quality Profile Name (optional)</Text>
                                <Tooltip content="Only series using this specific quality profile will be considered. Leave empty to include all quality profiles.">
                                  <TextField.Root
                                    value={instance.qualityProfileName || ''}
                                    onChange={(e) => updateInstanceConfig('sonarr', instance.id, 'qualityProfileName', e.target.value)}
                                  />
                                </Tooltip>
                              </Flex>

                              <Separator />

                              <Flex direction="row" align="center" justify="between" gap="2">
                                <Text size="2" weight="medium">Clear Tags</Text>
                                <Tooltip content="Removes the configured tag from all series in this Sonarr instance. This is useful for resetting the upgrade process or clearing tags from all media at once.">
                                  <Button
                                    variant="outline"
                                    size="2"
                                    color="red"
                                    onClick={async () => {
                                      try {
                                        await axios.post(`/api/config/clear-tags/sonarr/${instance.id}`);
                                      } catch (error: any) {
                                        console.error('Failed to clear tags:', error);
                                      }
                                    }}
                                  >
                                    Clear Tags
                                  </Button>
                                </Tooltip>
                              </Flex>
                            </Flex>
                          </Collapsible.Content>
                        </Collapsible.Root>
                      </Flex>
                    </Card>
                  );
                })}
              </Grid>
            </Flex>
          </Tabs.Content>

          <Tabs.Content value="notifications" style={{ paddingTop: '1rem' }}>
            <Card>
              <Flex direction="column" gap="4" p="4">
                <Heading size="5">Notification Configuration</Heading>
                <Separator />

                <Flex direction="column" gap="1">
                  <Text size="2" weight="medium">Discord Webhook URL (optional)</Text>
                  <TextField.Root
                    value={config.notifications.discordWebhook}
                    onChange={(e) => updateNotificationConfig('discordWebhook', e.target.value)}
                    placeholder="https://discord.com/api/webhooks/..."
                  />
                  <Text size="1" color="gray">
                    Discord webhook URL to receive notifications when upgrades are performed. Leave empty to disable Discord notifications.
                  </Text>
                </Flex>

                <Flex direction="column" gap="1">
                  <Text size="2" weight="medium">Notifiarr Passthrough Webhook (optional)</Text>
                  <TextField.Root
                    value={config.notifications.notifiarrPassthroughWebhook}
                    onChange={(e) => updateNotificationConfig('notifiarrPassthroughWebhook', e.target.value)}
                  />
                  <Text size="1" color="gray">
                    Notifiarr passthrough webhook URL for notifications. Leave empty to disable Notifiarr notifications.
                  </Text>
                </Flex>

                <Flex direction="column" gap="1">
                  <Text size="2" weight="medium">Notifiarr Discord Channel ID (optional)</Text>
                  <TextField.Root
                    value={config.notifications.notifiarrPassthroughDiscordChannelId}
                    onChange={(e) => updateNotificationConfig('notifiarrPassthroughDiscordChannelId', e.target.value)}
                  />
                  <Text size="1" color="gray">
                    Discord channel ID where Notifiarr notifications should be sent (17-19 digit number). Required if using Notifiarr webhook.
                  </Text>
                </Flex>
              </Flex>
            </Card>
          </Tabs.Content>

          <Tabs.Content value="scheduler" style={{ paddingTop: '1rem' }}>
            <Card>
              <Flex direction="column" gap="4" p="4">
                <Heading size="5">Scheduler Configuration</Heading>
                <Separator />

                <Flex direction="row" align="center" justify="between" gap="2">
                  <Text size="2" weight="medium">Enable Scheduler</Text>
                  <Tooltip content="When enabled, searches will run automatically according to the schedule below.">
                    <span>
                      <Switch
                        checked={config.scheduler?.enabled || false}
                        onCheckedChange={(checked) => {
                          if (!config.scheduler) {
                            setConfig({
                              ...config,
                              scheduler: { enabled: checked, schedule: '0 */6 * * *', unattended: false }
                            });
                          } else {
                            setConfig({
                              ...config,
                              scheduler: { ...config.scheduler, enabled: checked }
                            });
                          }
                        }}
                      />
                    </span>
                  </Tooltip>
                </Flex>

                <Flex direction="row" align="center" justify="between" gap="2">
                  <Text size="2" weight="medium">Unattended Mode</Text>
                  <Tooltip content="When enabled, the scheduler will automatically remove tags from all media and re-filter when no media is found, allowing continuous operation without manual intervention.">
                    <span>
                      <Switch
                        checked={config.scheduler?.unattended || false}
                        onCheckedChange={(checked) => {
                          if (!config.scheduler) {
                            setConfig({
                              ...config,
                              scheduler: { enabled: false, schedule: '0 */6 * * *', unattended: checked }
                            });
                          } else {
                            setConfig({
                              ...config,
                              scheduler: { ...config.scheduler, unattended: checked }
                            });
                          }
                        }}
                      />
                    </span>
                  </Tooltip>
                </Flex>

                <Flex direction="column" gap="1">
                  <Text size="2" weight="medium">Schedule</Text>
                  <Select.Root
                    value={schedulerPreset}
                    onValueChange={(value) => {
                      setSchedulerPreset(value);
                      const schedule = value === 'custom' 
                        ? (config.scheduler?.schedule || '0 */6 * * *')
                        : cronPresets[value];
                      if (!config.scheduler) {
                        setConfig({
                          ...config,
                          scheduler: { enabled: false, schedule, unattended: false }
                        });
                      } else {
                        setConfig({
                          ...config,
                          scheduler: { ...config.scheduler, schedule }
                        });
                      }
                    }}
                  >
                    <Select.Trigger />
                    <Select.Content position="popper" sideOffset={5}>
                      <Select.Item value="every-10-min">Every 10 Minutes</Select.Item>
                      <Select.Item value="every-30-min">Every 30 Minutes</Select.Item>
                      <Select.Item value="every-hour">Every Hour</Select.Item>
                      <Select.Item value="every-6-hours">Every 6 Hours</Select.Item>
                      <Select.Item value="every-12-hours">Every 12 Hours</Select.Item>
                      <Select.Item value="daily-midnight">Daily at Midnight</Select.Item>
                      <Select.Item value="daily-noon">Daily at Noon</Select.Item>
                      <Select.Item value="twice-daily">Twice Daily (Midnight & Noon)</Select.Item>
                      <Select.Item value="weekly-sunday">Weekly on Sunday</Select.Item>
                      <Select.Item value="custom">Custom Cron Expression</Select.Item>
                    </Select.Content>
                  </Select.Root>
                  {schedulerPreset === 'custom' && (
                    <TextField.Root
                      value={config.scheduler?.schedule || '0 */6 * * *'}
                      onChange={(e) => {
                        if (!config.scheduler) {
                          setConfig({
                            ...config,
                            scheduler: { enabled: false, schedule: e.target.value }
                          });
                        } else {
                          setConfig({
                            ...config,
                            scheduler: { ...config.scheduler, schedule: e.target.value }
                          });
                        }
                      }}
                      placeholder="0 */6 * * *"
                    />
                  )}
                  <Text size="1" color="gray">
                    {schedulerPreset === 'custom' 
                      ? 'Enter a custom cron expression. Format: minute hour day month day-of-week (e.g., "0 */6 * * *" for every 6 hours)'
                      : 'Select a predefined schedule or choose "Custom Cron Expression" to enter your own.'}
                  </Text>
                </Flex>
              </Flex>
            </Card>
          </Tabs.Content>
        </Tabs.Root>
      </Flex>
    </div>
  );
}

export default Settings;
