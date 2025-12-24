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
import { CheckIcon, CrossCircledIcon, PlusIcon, TrashIcon, ChevronDownIcon, ChevronRightIcon, Cross2Icon } from '@radix-ui/react-icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import validator from 'validator';
import cronstrue from 'cronstrue';
import axios from 'axios';
import type { Config } from '../types/config';
import { configSchema } from '../schemas/configSchema';
import { getErrorMessage } from '../utils/helpers';
import { CRON_PRESETS, getPresetFromSchedule, MAX_INSTANCES_PER_APP } from '../utils/constants';

function Settings() {
  const queryClient = useQueryClient();
  const [config, setConfig] = useState<Config | null>(null);
  const [testResults, setTestResults] = useState<Record<string, { status: boolean | null; testing: boolean }>>({});
  const [schedulerPreset, setSchedulerPreset] = useState<string>('custom');
  const [activeTab, setActiveTab] = useState<string>('applications');
  const [selectedAppType, setSelectedAppType] = useState<'radarr' | 'sonarr' | 'lidarr' | 'readarr'>('radarr');
  const [expandedInstances, setExpandedInstances] = useState<Set<string>>(new Set());
  const [confirmingClearTags, setConfirmingClearTags] = useState<string | null>(null);
  const [confirmingDeleteInstance, setConfirmingDeleteInstance] = useState<string | null>(null);
  const [confirmingResetConfig, setConfirmingResetConfig] = useState<boolean>(false);
  const [showIntroCallout, setShowIntroCallout] = useState(true);
  const [showHintCallout, setShowHintCallout] = useState(true);


  // Load config with react-query
  const { data: loadedConfig, isLoading: loading, error: loadError, refetch: refetchConfig } = useQuery<Config>({
    queryKey: ['config'],
    queryFn: async () => {
      const response = await axios.get('/api/config');
      return normalizeConfig(response.data);
    },
    refetchOnWindowFocus: true,
  });

  // Update local config when loaded config changes
  useEffect(() => {
    if (loadedConfig) {
      setConfig(loadedConfig);
      if (loadedConfig.scheduler?.schedule) {
        setSchedulerPreset(getPresetFromSchedule(loadedConfig.scheduler.schedule));
      }
    }
  }, [loadedConfig]);

  // Load persisted callout visibility once on mount
  useEffect(() => {
    try {
      const introDismissed = localStorage.getItem('scoutarr_settings_intro_dismissed') === 'true';
      const hintDismissed = localStorage.getItem('scoutarr_settings_hint_dismissed') === 'true';
      if (introDismissed) {
        setShowIntroCallout(false);
      }
      if (hintDismissed) {
        setShowHintCallout(false);
      }
    } catch {
      // Ignore storage errors and fall back to defaults
    }
  }, []);

  // Save config mutation with validation
  const saveConfigMutation = useMutation({
    mutationFn: async (configToSave: Config) => {
      // Validate config with zod
      try {
        configSchema.parse(configToSave);
      } catch (error: any) {
        const errorMessages = error.errors?.map((e: any) => `${e.path.join('.')}: ${e.message}`).join(', ');
        throw new Error(`Validation failed: ${errorMessages}`);
      }
      await axios.put('/api/config', configToSave);
    },
    onSuccess: () => {
      toast.success('Configuration saved successfully!');
      queryClient.invalidateQueries({ queryKey: ['config'] });
      refetchConfig();
    },
    onError: (error: unknown) => {
      toast.error('Failed to save config: ' + getErrorMessage(error));
    },
  });

  const saveConfig = async () => {
    if (!config) return;
    saveConfigMutation.mutate(config);
  };

  // Reset config mutation
  const resetConfigMutation = useMutation({
    mutationFn: async () => {
      await axios.post('/api/config/reset');
    },
    onSuccess: () => {
      toast.success('Configuration reset to defaults');
      queryClient.invalidateQueries({ queryKey: ['config'] });
      refetchConfig();
      setConfirmingResetConfig(false);
    },
    onError: (error: unknown) => {
      toast.error('Failed to reset config: ' + getErrorMessage(error));
      setConfirmingResetConfig(false);
    },
  });


  // Helper to get next available instance ID
  const getNextInstanceId = (_app: 'radarr' | 'sonarr' | 'lidarr' | 'readarr', instances: any[]): number => {
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

  // Helper to normalize config - ensure instances have stable IDs and instanceIds
  const normalizeConfig = (config: Config): Config => {
    const normalized = { ...config };
    
    // Ensure applications object exists
    if (!normalized.applications) {
      normalized.applications = { radarr: [], sonarr: [], lidarr: [], readarr: [] };
    }
    
    // Ensure all app arrays exist and normalize instances
    normalized.applications.radarr = (normalized.applications.radarr || []).map((inst: any, idx: number) => ({
      ...inst,
      instanceId: inst.instanceId || idx + 1
    }));

    normalized.applications.sonarr = (normalized.applications.sonarr || []).map((inst: any, idx: number) => ({
      ...inst,
      instanceId: inst.instanceId || idx + 1
    }));
    
    normalized.applications.lidarr = (normalized.applications.lidarr || []).map((inst: any, idx: number) => ({
      ...inst,
      instanceId: inst.instanceId || idx + 1
    }));
    
    normalized.applications.readarr = (normalized.applications.readarr || []).map((inst: any, idx: number) => ({
      ...inst,
      instanceId: inst.instanceId || idx + 1
    }));
    
    return normalized;
  };

  // Get instances for an app
  const getInstances = (app: 'radarr' | 'sonarr' | 'lidarr' | 'readarr'): any[] => {
    if (!config) return [];
    return config.applications[app] as any[];
  };

  // Update instance config
  const updateInstanceConfig = (app: 'radarr' | 'sonarr' | 'lidarr' | 'readarr', instanceId: string, field: string, value: any) => {
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
  const addInstance = (app: 'radarr' | 'sonarr' | 'lidarr' | 'readarr') => {
    if (!config) return;
    const instances = getInstances(app);
    // Limit instances per app
    if (instances.length >= MAX_INSTANCES_PER_APP) {
      toast.error(`Maximum of ${MAX_INSTANCES_PER_APP} ${app.charAt(0).toUpperCase() + app.slice(1)} instances allowed.`);
      return;
    }
    const newId = `${app}-${Date.now()}`;
    const nextInstanceId = getNextInstanceId(app, instances);
    
    let defaultConfig: any;
    if (app === 'radarr') {
      defaultConfig = {
        id: newId,
        instanceId: nextInstanceId,
        name: '',
        url: '',
        apiKey: '',
        count: 5,
        tagName: 'upgradinatorr',
        ignoreTag: '',
        monitored: true,
        movieStatus: 'any' as const,
        qualityProfileName: '',
        enabled: true
      };
    } else if (app === 'sonarr') {
      defaultConfig = {
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
    } else if (app === 'lidarr') {
      defaultConfig = {
        id: newId,
        instanceId: nextInstanceId,
        name: '',
        url: '',
        apiKey: '',
        count: 5,
        tagName: 'upgradinatorr',
        ignoreTag: '',
        monitored: true,
        artistStatus: '',
        qualityProfileName: '',
        enabled: true
      };
    } else { // readarr
      defaultConfig = {
        id: newId,
        instanceId: nextInstanceId,
        name: '',
        url: '',
        apiKey: '',
        count: 5,
        tagName: 'upgradinatorr',
        ignoreTag: '',
        monitored: true,
        authorStatus: '',
        qualityProfileName: '',
        enabled: true
      };
    }
    
    setConfig({
      ...config,
      applications: {
        ...config.applications,
        [app]: [...instances, defaultConfig]
      }
    });
  };

  // Remove instance
  const removeInstance = (app: 'radarr' | 'sonarr' | 'lidarr' | 'readarr', instanceId: string) => {
    if (!config) return;
    const instances = getInstances(app);
    const updatedInstances = instances.filter(inst => inst.id !== instanceId);
    setConfig({
      ...config,
      applications: {
        ...config.applications,
        [app]: updatedInstances
      }
    });
    setConfirmingDeleteInstance(null);
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

  if (loadError || !config) {
    return (
      <Callout.Root color="red" style={{ padding: '2rem' }}>
        <Callout.Text>Failed to load configuration</Callout.Text>
        <Callout.Text size="1" style={{ marginTop: '0.5rem' }}>
          <Button size="2" variant="soft" onClick={() => refetchConfig()}>
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
    if (instanceId && Array.isArray(config.applications[app as 'radarr' | 'sonarr' | 'lidarr' | 'readarr'])) {
      const instances = config.applications[app as 'radarr' | 'sonarr' | 'lidarr' | 'readarr'] as any[];
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

    // Validate URL with validator library
    if (!validator.isURL(appConfig.url, { require_protocol: true })) {
      toast.error('Invalid URL format');
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
      const success = response.data.success === true;
      setTestResults(prev => ({
        ...prev,
        [key]: { status: success, testing: false }
      }));
      if (success) {
        toast.success('Connection test successful');
      } else {
        toast.error('Connection test failed');
      }
    } catch (error: any) {
      setTestResults(prev => ({
        ...prev,
        [key]: { status: false, testing: false }
      }));
      toast.error('Connection test failed: ' + getErrorMessage(error));
    }
  };

  // Helper to get app-specific labels and configuration
  const getAppInfo = (appType: 'radarr' | 'sonarr' | 'lidarr' | 'readarr') => {
    const appNames = {
      radarr: { name: 'Radarr', mediaType: 'Movies', mediaTypePlural: 'movies', defaultPort: '7878' },
      sonarr: { name: 'Sonarr', mediaType: 'Series', mediaTypePlural: 'series', defaultPort: '8989' },
      lidarr: { name: 'Lidarr', mediaType: 'Artists', mediaTypePlural: 'artists', defaultPort: '8686' },
      readarr: { name: 'Readarr', mediaType: 'Authors', mediaTypePlural: 'authors', defaultPort: '8787' }
    };
    return appNames[appType];
  };

  return (
    <div style={{ width: '100%', paddingTop: 0, marginTop: 0 }}>
      <Flex direction="column" gap="3">
        {showIntroCallout && (
          <Callout.Root color="blue">
            <Flex align="start" justify="between" gap="3">
              <Callout.Text>
                <Text weight="bold" size="3">What is Scoutarr?</Text>
                <br />
                <Text size="2">
                  Scoutarr automates media upgrades in your Starr applications (Radarr, Sonarr, etc.) by triggering manual searches for media items that meet your criteria. It helps find better quality versions of your media.
                </Text>
              </Callout.Text>
              <button
                type="button"
                aria-label="Dismiss intro"
                onClick={() => {
                  setShowIntroCallout(false);
                  try {
                    localStorage.setItem('scoutarr_settings_intro_dismissed', 'true');
                  } catch {
                    // ignore
                  }
                }}
                style={{
                  border: 'none',
                  background: 'transparent',
                  padding: 0,
                  marginLeft: 'auto',
                  marginRight: '0.25rem',
                  marginTop: '0.25rem',
                  cursor: 'pointer',
                  color: 'var(--gray-11)',
                }}
              >
                <Cross2Icon />
              </button>
            </Flex>
          </Callout.Root>
        )}

        {showHintCallout && (
          <Callout.Root color="blue" size="1">
            <Flex align="center" justify="between" gap="2">
              <Callout.Text>
                <Text size="1">💡 Hover over input fields to see descriptions and hints</Text>
              </Callout.Text>
              <button
                type="button"
                aria-label="Dismiss hint"
                onClick={() => {
                  setShowHintCallout(false);
                  try {
                    localStorage.setItem('scoutarr_settings_hint_dismissed', 'true');
                  } catch {
                    // ignore
                  }
                }}
                style={{
                  border: 'none',
                  background: 'transparent',
                  padding: 0,
                  marginRight: '0.25rem',
                  cursor: 'pointer',
                  color: 'var(--gray-11)',
                }}
              >
                <Cross2Icon />
              </button>
            </Flex>
          </Callout.Root>
        )}

        <Tabs.Root value={activeTab} onValueChange={setActiveTab}>
          <Flex align="center" justify="between" gap="3">
            <Tabs.List>
              <Tabs.Trigger value="applications">Applications</Tabs.Trigger>
              <Tabs.Trigger value="notifications">Notifications</Tabs.Trigger>
              <Tabs.Trigger value="scheduler">Scheduler</Tabs.Trigger>
              <Tabs.Trigger value="advanced">Advanced</Tabs.Trigger>
            </Tabs.List>
            <Flex gap="2" align="center">
              {activeTab === 'applications' && (
                <Button
                  size="2"
                  variant="outline"
                  onClick={() => addInstance(selectedAppType)}
                  disabled={getInstances(selectedAppType).length >= MAX_INSTANCES_PER_APP}
                >
                  <PlusIcon /> Add {selectedAppType.charAt(0).toUpperCase() + selectedAppType.slice(1)} Instance
                </Button>
              )}
              <Button size="2" onClick={saveConfig} disabled={saveConfigMutation.isPending || loading}>
                {saveConfigMutation.isPending ? (
                  <>
                    <Spinner size="1" /> Saving...
                  </>
                ) : (
                  'Save Configuration'
                )}
              </Button>
            </Flex>
          </Flex>

          <Tabs.Content value="applications" style={{ paddingTop: '1rem' }}>
            <Flex direction="column" gap="3">
              <Flex align="center" justify="between">
                <Heading size="5">Applications</Heading>
                <Flex gap="2" align="center">
                  <Text size="2">Application Type:</Text>
                  <Select.Root value={selectedAppType} onValueChange={(value) => setSelectedAppType(value as 'radarr' | 'sonarr' | 'lidarr' | 'readarr')}>
                    <Select.Trigger style={{ minWidth: '120px' }} />
                    <Select.Content>
                      <Select.Item value="radarr">Radarr</Select.Item>
                      <Select.Item value="sonarr">Sonarr</Select.Item>
                      <Select.Item value="lidarr">Lidarr</Select.Item>
                      <Select.Item value="readarr">Readarr</Select.Item>
                    </Select.Content>
                  </Select.Root>
                </Flex>
              </Flex>
              <Grid columns={{ initial: '1', md: '2' }} gap="3">
                {getInstances(selectedAppType).map((instance, idx) => {
                  const appInfo = getAppInfo(selectedAppType);
                  const instanceKey = `${selectedAppType}-${instance.id}`;
                  const isExpanded = expandedInstances.has(instanceKey);
                  const displayName = instance.name || `${appInfo.name} ${instance.instanceId || idx + 1}`;
                  
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
                                  {confirmingDeleteInstance === `${selectedAppType}-${instance.id}` ? (
                                    <Flex gap="1" align="center">
                                      <Text size="1" color="gray">Delete?</Text>
                                      <Button 
                                        variant="solid" 
                                        color="red" 
                                        size="1"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          removeInstance(selectedAppType, instance.id);
                                        }}
                                      >
                                        Yes
                                      </Button>
                                      <Button 
                                        variant="outline" 
                                        size="1"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setConfirmingDeleteInstance(null);
                                        }}
                                      >
                                        Cancel
                                      </Button>
                                    </Flex>
                                  ) : (
                                    <Tooltip content="Delete this instance">
                                      <Button 
                                        variant="soft" 
                                        color="red" 
                                        size="1"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setConfirmingDeleteInstance(`${selectedAppType}-${instance.id}`);
                                        }}
                                      >
                                        <TrashIcon />
                                      </Button>
                                    </Tooltip>
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
                                      onCheckedChange={(checked) => updateInstanceConfig(selectedAppType, instance.id, 'enabled', checked)}
                                    />
                                  </span>
                                </Tooltip>
                              </Flex>
                              <Separator />
                              <Flex direction="column" gap="2">
                                <Text size="2" weight="medium">Name (optional)</Text>
                                <Tooltip content={`A friendly name to identify this instance (e.g., 'Main ${appInfo.name}', '4K ${appInfo.name}'). Leave empty to use default ID.`}>
                                  <TextField.Root
                                    value={instance.name || ''}
                                    onChange={(e) => updateInstanceConfig(selectedAppType, instance.id, 'name', e.target.value)}
                                    placeholder={`${appInfo.name} ${instance.instanceId || idx + 1}`}
                                  />
                                </Tooltip>
                              </Flex>

                              <Flex direction="column" gap="2">
                                <Text size="2" weight="medium">{appInfo.name} URL</Text>
                                <Tooltip content={`The base URL where your ${appInfo.name} instance is accessible (e.g., http://localhost:${appInfo.defaultPort} or https://${selectedAppType}.example.com)`}>
                                  <TextField.Root
                                    placeholder={`http://localhost:${appInfo.defaultPort}`}
                                    value={instance.url || ''}
                                    onChange={(e) => updateInstanceConfig(selectedAppType, instance.id, 'url', e.target.value)}
                                  />
                                </Tooltip>
                              </Flex>

                              <Flex direction="column" gap="2">
                                <Text size="2" weight="medium">API Key</Text>
                                <Tooltip content={`Your ${appInfo.name} API key found in Settings → General → Security → API Key (must be 32 characters)`}>
                                  <TextField.Root
                                    type="password"
                                    placeholder="API Key"
                                    value={instance.apiKey || ''}
                                    onChange={(e) => updateInstanceConfig(selectedAppType, instance.id, 'apiKey', e.target.value)}
                                  />
                                </Tooltip>
                              </Flex>

                              {renderTestButton(selectedAppType, instance.id)}

                              <Flex direction="column" gap="2">
                                <Text size="2" weight="medium">Number of {appInfo.mediaTypePlural.charAt(0).toUpperCase() + appInfo.mediaTypePlural.slice(1)} to Search</Text>
                                <Tooltip content={`How many ${appInfo.mediaTypePlural} to randomly select and search for upgrades each time the script runs. Use 'max' to search all matching ${appInfo.mediaTypePlural}.`}>
                                  <TextField.Root
                                    type="number"
                                    value={(instance.count || 5).toString()}
                                    onChange={(e) => updateInstanceConfig(selectedAppType, instance.id, 'count', parseInt(e.target.value) || 5)}
                                  />
                                </Tooltip>
                              </Flex>

                              <Flex direction="column" gap="2">
                                <Text size="2" weight="medium">Tag Name (optional)</Text>
                                <Tooltip content={`The tag name to use for tracking which ${appInfo.mediaTypePlural} have been searched. This tag will be created automatically if it doesn't exist.`}>
                                  <TextField.Root
                                    value={instance.tagName || ''}
                                    onChange={(e) => updateInstanceConfig(selectedAppType, instance.id, 'tagName', e.target.value)}
                                  />
                                </Tooltip>
                              </Flex>

                              <Flex direction="column" gap="2">
                                <Text size="2" weight="medium">Ignore Tag (optional)</Text>
                                <Tooltip content={`${appInfo.mediaType} with this tag will be excluded from upgrade searches. Leave empty to include all ${appInfo.mediaTypePlural} matching other criteria.`}>
                                  <TextField.Root
                                    value={instance.ignoreTag || ''}
                                    onChange={(e) => updateInstanceConfig(selectedAppType, instance.id, 'ignoreTag', e.target.value)}
                                  />
                                </Tooltip>
                              </Flex>

                              <Flex direction="row" align="center" justify="between" gap="2">
                                <Text size="2" weight="medium">Search Monitored {appInfo.mediaType} Only</Text>
                                <Tooltip content={`When enabled, only ${appInfo.mediaTypePlural} that are currently monitored will be considered for upgrades.`}>
                                  <span>
                                    <Switch
                                      checked={instance.monitored ?? true}
                                      onCheckedChange={(checked) => updateInstanceConfig(selectedAppType, instance.id, 'monitored', checked)}
                                    />
                                  </span>
                                </Tooltip>
                              </Flex>

                              {selectedAppType === 'radarr' && (
                                <Flex direction="column" gap="2">
                                  <Text size="2" weight="medium">Movie Status</Text>
                                  <Tooltip content="Only movies with this status or higher will be considered for upgrades. Released is recommended for most use cases.">
                                    <Select.Root
                                      value={instance.movieStatus || 'any'}
                                      onValueChange={(value) => updateInstanceConfig('radarr', instance.id, 'movieStatus', value)}
                                    >
                                      <Select.Trigger />
                                      <Select.Content position="popper" sideOffset={5}>
                                        <Select.Item value="any">Any</Select.Item>
                                        <Select.Item value="announced">Announced</Select.Item>
                                        <Select.Item value="in cinemas">In Cinemas</Select.Item>
                                        <Select.Item value="released">Released</Select.Item>
                                      </Select.Content>
                                    </Select.Root>
                                  </Tooltip>
                                </Flex>
                              )}
                              
                              {selectedAppType === 'sonarr' && (
                                <Flex direction="column" gap="2">
                                  <Text size="2" weight="medium">Series Status</Text>
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
                              )}

                              {(selectedAppType === 'lidarr' || selectedAppType === 'readarr') && (
                                <Flex direction="column" gap="2">
                                  <Text size="2" weight="medium">{appInfo.mediaType} Status</Text>
                                  <Tooltip content={`Only ${appInfo.mediaTypePlural.toLowerCase()} with this status will be considered for upgrades. Leave as 'Any' to include all statuses.`}>
                                    <Select.Root
                                      value={selectedAppType === 'lidarr' ? (instance.artistStatus || 'any') : (instance.authorStatus || 'any')}
                                      onValueChange={(value) => {
                                        const field = selectedAppType === 'lidarr' ? 'artistStatus' : 'authorStatus';
                                        updateInstanceConfig(selectedAppType, instance.id, field, value === 'any' ? '' : value);
                                      }}
                                    >
                                      <Select.Trigger />
                                      <Select.Content position="popper" sideOffset={5}>
                                        <Select.Item value="any">Any</Select.Item>
                                        <Select.Item value="continuing">Continuing</Select.Item>
                                        <Select.Item value="ended">Ended</Select.Item>
                                      </Select.Content>
                                    </Select.Root>
                                  </Tooltip>
                                </Flex>
                              )}

                              <Flex direction="column" gap="2">
                                <Text size="2" weight="medium">Quality Profile Name (optional)</Text>
                                <Tooltip content={`Only ${appInfo.mediaTypePlural.toLowerCase()} using this specific quality profile will be considered. Leave empty to include all quality profiles.`}>
                                  <TextField.Root
                                    value={instance.qualityProfileName || ''}
                                    onChange={(e) => updateInstanceConfig(selectedAppType, instance.id, 'qualityProfileName', e.target.value)}
                                  />
                                </Tooltip>
                              </Flex>

                              <Separator />

                              <Flex direction="row" align="center" justify="between" gap="2">
                                <Text size="2" weight="medium">Clear Tags</Text>
                                {confirmingClearTags === `${selectedAppType}-${instance.id}` ? (
                                  <Flex gap="2" align="center">
                                    <Text size="1" color="gray">Confirm?</Text>
                                    <Button
                                      variant="solid"
                                      size="2"
                                      color="red"
                                      onClick={async () => {
                                        try {
                                          await axios.post(`/api/config/clear-tags/${selectedAppType}/${instance.id}`);
                                          toast.success('Tags cleared successfully');
                                          setConfirmingClearTags(null);
                                        } catch (error: unknown) {
                                          toast.error('Failed to clear tags: ' + getErrorMessage(error));
                                          setConfirmingClearTags(null);
                                        }
                                      }}
                                    >
                                      Confirm
                                    </Button>
                                    <Button
                                      variant="outline"
                                      size="2"
                                      onClick={() => setConfirmingClearTags(null)}
                                    >
                                      Cancel
                                    </Button>
                                  </Flex>
                                ) : (
                                  <Tooltip content={`Removes the configured tag from all ${appInfo.mediaTypePlural.toLowerCase()} in this ${appInfo.name} instance. This is useful for resetting the upgrade process or clearing tags from all media at once.`}>
                                    <Button
                                      variant="outline"
                                      size="2"
                                      color="red"
                                      onClick={() => setConfirmingClearTags(`${selectedAppType}-${instance.id}`)}
                                    >
                                      Clear Tags
                                    </Button>
                                  </Tooltip>
                                )}
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
                  <Tooltip content="Webhook URL where Discord notifications will be sent. Leave empty to disable.">
                    <TextField.Root
                      value={config.notifications.discordWebhook}
                      onChange={(e) => updateNotificationConfig('discordWebhook', e.target.value)}
                    />
                  </Tooltip>
                </Flex>

                <Flex direction="column" gap="1">
                  <Text size="2" weight="medium">Notifiarr Passthrough Webhook (optional)</Text>
                  <Tooltip content="Notifiarr passthrough webhook for notifications. Leave empty to disable.">
                    <TextField.Root
                      value={config.notifications.notifiarrPassthroughWebhook}
                      onChange={(e) => updateNotificationConfig('notifiarrPassthroughWebhook', e.target.value)}
                    />
                  </Tooltip>
                </Flex>

                <Flex direction="column" gap="1">
                  <Text size="2" weight="medium">Notifiarr Discord Channel ID (optional)</Text>
                  <Tooltip content="Discord channel ID for Notifiarr notifications (17–19 digits). Required if a Notifiarr webhook is set.">
                    <TextField.Root
                      value={config.notifications.notifiarrPassthroughDiscordChannelId}
                      onChange={(e) => updateNotificationConfig('notifiarrPassthroughDiscordChannelId', e.target.value)}
                    />
                  </Tooltip>
                </Flex>
              </Flex>
            </Card>
          </Tabs.Content>

          <Tabs.Content value="scheduler" style={{ paddingTop: '1rem' }}>
            <Card>
              <Flex direction="column" gap="4" p="4">
                <Heading size="5">Global Schedule</Heading>
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
                        : CRON_PRESETS[value];
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
                      <Select.Item value="every-1-min">Every 1 Minute</Select.Item>
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
                            scheduler: { enabled: false, schedule: e.target.value, unattended: false }
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
                      ? (() => {
                          try {
                            const cronExpression = config.scheduler?.schedule || '0 */6 * * *';
                            const description = cronstrue.toString(cronExpression, { use24HourTimeFormat: true });
                            return `Enter a custom cron expression. Current: "${cronExpression}" (${description})`;
                          } catch {
                            return 'Enter a custom cron expression. Format: minute hour day month day-of-week (e.g., "0 */6 * * *" for every 6 hours)';
                          }
                        })()
                      : (() => {
                          try {
                            const currentCron = config.scheduler?.schedule || '0 */6 * * *';
                            const description = cronstrue.toString(currentCron, { use24HourTimeFormat: true });
                            return `Current schedule: ${description}. Select a predefined schedule or choose "Custom Cron Expression" to enter your own.`;
                          } catch {
                            return 'Select a predefined schedule or choose "Custom Cron Expression" to enter your own.';
                          }
                        })()}
                  </Text>
                </Flex>
              </Flex>
            </Card>

            {/* Per-Instance Scheduling */}
            <Card>
              <Flex direction="column" gap="4" p="4">
                <Heading size="5">Per-Instance Schedule</Heading>
                <Separator />
                <Text size="2" color="gray">
                  Configure individual schedules for each instance. When enabled, the instance will run searches according to its own schedule, independent of the global scheduler and other instances.
                </Text>

                {/* Radarr Instances */}
                {getInstances('radarr').length > 0 && (
                  <Flex direction="column" gap="3">
                    <Heading size="4">Radarr Instances</Heading>
                    {getInstances('radarr').map((instance) => {
                      const instanceSchedulePreset = instance.schedule ? getPresetFromSchedule(instance.schedule) : 'custom';
                      return (
                        <Card key={instance.id} variant="surface">
                          <Flex direction="column" gap="3" p="3">
                            <Flex direction="row" align="center" justify="between">
                              <Text size="3" weight="medium">{instance.name || `Radarr ${instance.instanceId || ''}`}</Text>
                              <Flex direction="row" align="center" gap="2">
                                <Text size="2">Enable Schedule</Text>
                                <Switch
                                  checked={instance.scheduleEnabled || false}
                                  onCheckedChange={(checked) => {
                                    updateInstanceConfig('radarr', instance.id, 'scheduleEnabled', checked);
                                    if (checked && !instance.schedule) {
                                      updateInstanceConfig('radarr', instance.id, 'schedule', '0 */6 * * *');
                                    }
                                  }}
                                />
                              </Flex>
                            </Flex>
                            {instance.scheduleEnabled && (
                              <Flex direction="column" gap="2">
                                <Text size="2" weight="medium">Schedule</Text>
                                <Select.Root
                                  value={instanceSchedulePreset}
                                  onValueChange={(value) => {
                                    const schedule = value === 'custom' 
                                      ? (instance.schedule || '0 */6 * * *')
                                      : CRON_PRESETS[value];
                                    updateInstanceConfig('radarr', instance.id, 'schedule', schedule);
                                  }}
                                >
                                  <Select.Trigger />
                                  <Select.Content position="popper" sideOffset={5}>
                                    <Select.Item value="every-1-min">Every 1 Minute</Select.Item>
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
                                {instanceSchedulePreset === 'custom' && (
                                  <TextField.Root
                                    value={instance.schedule || '0 */6 * * *'}
                                    onChange={(e) => {
                                      updateInstanceConfig('radarr', instance.id, 'schedule', e.target.value);
                                    }}
                                    placeholder="0 */6 * * *"
                                  />
                                )}
                                <Text size="1" color="gray">
                                  {instanceSchedulePreset === 'custom' 
                                    ? (() => {
                                        try {
                                          const cronExpression = instance.schedule || '0 */6 * * *';
                                          const description = cronstrue.toString(cronExpression, { use24HourTimeFormat: true });
                                          return `Current: "${cronExpression}" (${description})`;
                                        } catch {
                                          return 'Enter a custom cron expression';
                                        }
                                      })()
                                    : (() => {
                                        try {
                                          const currentCron = instance.schedule || '0 */6 * * *';
                                          const description = cronstrue.toString(currentCron, { use24HourTimeFormat: true });
                                          return description;
                                        } catch {
                                          return '';
                                        }
                                      })()}
                                </Text>
                              </Flex>
                            )}
                          </Flex>
                        </Card>
                      );
                    })}
                  </Flex>
                )}

                {/* Sonarr Instances */}
                {getInstances('sonarr').length > 0 && (
                  <Flex direction="column" gap="3">
                    <Heading size="4">Sonarr Instances</Heading>
                    {getInstances('sonarr').map((instance) => {
                      const instanceSchedulePreset = instance.schedule ? getPresetFromSchedule(instance.schedule) : 'custom';
                      return (
                        <Card key={instance.id} variant="surface">
                          <Flex direction="column" gap="3" p="3">
                            <Flex direction="row" align="center" justify="between">
                              <Text size="3" weight="medium">{instance.name || `Sonarr ${instance.instanceId || ''}`}</Text>
                              <Flex direction="row" align="center" gap="2">
                                <Text size="2">Enable Schedule</Text>
                                <Switch
                                  checked={instance.scheduleEnabled || false}
                                  onCheckedChange={(checked) => {
                                    updateInstanceConfig('sonarr', instance.id, 'scheduleEnabled', checked);
                                    if (checked && !instance.schedule) {
                                      updateInstanceConfig('sonarr', instance.id, 'schedule', '0 */6 * * *');
                                    }
                                  }}
                                />
                              </Flex>
                            </Flex>
                            {instance.scheduleEnabled && (
                              <Flex direction="column" gap="2">
                                <Text size="2" weight="medium">Schedule</Text>
                                <Select.Root
                                  value={instanceSchedulePreset}
                                  onValueChange={(value) => {
                                    const schedule = value === 'custom' 
                                      ? (instance.schedule || '0 */6 * * *')
                                      : CRON_PRESETS[value];
                                    updateInstanceConfig('sonarr', instance.id, 'schedule', schedule);
                                  }}
                                >
                                  <Select.Trigger />
                                  <Select.Content position="popper" sideOffset={5}>
                                    <Select.Item value="every-1-min">Every 1 Minute</Select.Item>
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
                                {instanceSchedulePreset === 'custom' && (
                                  <TextField.Root
                                    value={instance.schedule || '0 */6 * * *'}
                                    onChange={(e) => {
                                      updateInstanceConfig('sonarr', instance.id, 'schedule', e.target.value);
                                    }}
                                    placeholder="0 */6 * * *"
                                  />
                                )}
                                <Text size="1" color="gray">
                                  {instanceSchedulePreset === 'custom' 
                                    ? (() => {
                                        try {
                                          const cronExpression = instance.schedule || '0 */6 * * *';
                                          const description = cronstrue.toString(cronExpression, { use24HourTimeFormat: true });
                                          return `Current: "${cronExpression}" (${description})`;
                                        } catch {
                                          return 'Enter a custom cron expression';
                                        }
                                      })()
                                    : (() => {
                                        try {
                                          const currentCron = instance.schedule || '0 */6 * * *';
                                          const description = cronstrue.toString(currentCron, { use24HourTimeFormat: true });
                                          return description;
                                        } catch {
                                          return '';
                                        }
                                      })()}
                                </Text>
                              </Flex>
                            )}
                          </Flex>
                        </Card>
                      );
                    })}
                  </Flex>
                )}

                {/* Lidarr Instances */}
                {getInstances('lidarr').length > 0 && (
                  <Flex direction="column" gap="3">
                    <Heading size="4">Lidarr Instances</Heading>
                    {getInstances('lidarr').map((instance) => {
                      const instanceSchedulePreset = instance.schedule ? getPresetFromSchedule(instance.schedule) : 'custom';
                      return (
                        <Card key={instance.id} variant="surface">
                          <Flex direction="column" gap="3" p="3">
                            <Flex direction="row" align="center" justify="between">
                              <Text size="3" weight="medium">{instance.name || `Lidarr ${instance.instanceId || ''}`}</Text>
                              <Flex direction="row" align="center" gap="2">
                                <Text size="2">Enable Schedule</Text>
                                <Switch
                                  checked={instance.scheduleEnabled || false}
                                  onCheckedChange={(checked) => {
                                    updateInstanceConfig('lidarr', instance.id, 'scheduleEnabled', checked);
                                    if (checked && !instance.schedule) {
                                      updateInstanceConfig('lidarr', instance.id, 'schedule', '0 */6 * * *');
                                    }
                                  }}
                                />
                              </Flex>
                            </Flex>
                            {instance.scheduleEnabled && (
                              <Flex direction="column" gap="2">
                                <Text size="2" weight="medium">Schedule</Text>
                                <Select.Root
                                  value={instanceSchedulePreset}
                                  onValueChange={(value) => {
                                    const schedule = value === 'custom' 
                                      ? (instance.schedule || '0 */6 * * *')
                                      : CRON_PRESETS[value];
                                    updateInstanceConfig('lidarr', instance.id, 'schedule', schedule);
                                  }}
                                >
                                  <Select.Trigger />
                                  <Select.Content position="popper" sideOffset={5}>
                                    <Select.Item value="every-1-min">Every 1 Minute</Select.Item>
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
                                {instanceSchedulePreset === 'custom' && (
                                  <TextField.Root
                                    value={instance.schedule || '0 */6 * * *'}
                                    onChange={(e) => {
                                      updateInstanceConfig('lidarr', instance.id, 'schedule', e.target.value);
                                    }}
                                    placeholder="0 */6 * * *"
                                  />
                                )}
                                <Text size="1" color="gray">
                                  {instanceSchedulePreset === 'custom' 
                                    ? (() => {
                                        try {
                                          const cronExpression = instance.schedule || '0 */6 * * *';
                                          const description = cronstrue.toString(cronExpression, { use24HourTimeFormat: true });
                                          return `Current: "${cronExpression}" (${description})`;
                                        } catch {
                                          return 'Enter a custom cron expression';
                                        }
                                      })()
                                    : (() => {
                                        try {
                                          const currentCron = instance.schedule || '0 */6 * * *';
                                          const description = cronstrue.toString(currentCron, { use24HourTimeFormat: true });
                                          return description;
                                        } catch {
                                          return '';
                                        }
                                      })()}
                                </Text>
                              </Flex>
                            )}
                          </Flex>
                        </Card>
                      );
                    })}
                  </Flex>
                )}

                {/* Readarr Instances */}
                {getInstances('readarr').length > 0 && (
                  <Flex direction="column" gap="3">
                    <Heading size="4">Readarr Instances</Heading>
                    {getInstances('readarr').map((instance) => {
                      const instanceSchedulePreset = instance.schedule ? getPresetFromSchedule(instance.schedule) : 'custom';
                      return (
                        <Card key={instance.id} variant="surface">
                          <Flex direction="column" gap="3" p="3">
                            <Flex direction="row" align="center" justify="between">
                              <Text size="3" weight="medium">{instance.name || `Readarr ${instance.instanceId || ''}`}</Text>
                              <Flex direction="row" align="center" gap="2">
                                <Text size="2">Enable Schedule</Text>
                                <Switch
                                  checked={instance.scheduleEnabled || false}
                                  onCheckedChange={(checked) => {
                                    updateInstanceConfig('readarr', instance.id, 'scheduleEnabled', checked);
                                    if (checked && !instance.schedule) {
                                      updateInstanceConfig('readarr', instance.id, 'schedule', '0 */6 * * *');
                                    }
                                  }}
                                />
                              </Flex>
                            </Flex>
                            {instance.scheduleEnabled && (
                              <Flex direction="column" gap="2">
                                <Text size="2" weight="medium">Schedule</Text>
                                <Select.Root
                                  value={instanceSchedulePreset}
                                  onValueChange={(value) => {
                                    const schedule = value === 'custom' 
                                      ? (instance.schedule || '0 */6 * * *')
                                      : CRON_PRESETS[value];
                                    updateInstanceConfig('readarr', instance.id, 'schedule', schedule);
                                  }}
                                >
                                  <Select.Trigger />
                                  <Select.Content position="popper" sideOffset={5}>
                                    <Select.Item value="every-1-min">Every 1 Minute</Select.Item>
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
                                {instanceSchedulePreset === 'custom' && (
                                  <TextField.Root
                                    value={instance.schedule || '0 */6 * * *'}
                                    onChange={(e) => {
                                      updateInstanceConfig('readarr', instance.id, 'schedule', e.target.value);
                                    }}
                                    placeholder="0 */6 * * *"
                                  />
                                )}
                                <Text size="1" color="gray">
                                  {instanceSchedulePreset === 'custom' 
                                    ? (() => {
                                        try {
                                          const cronExpression = instance.schedule || '0 */6 * * *';
                                          const description = cronstrue.toString(cronExpression, { use24HourTimeFormat: true });
                                          return `Current: "${cronExpression}" (${description})`;
                                        } catch {
                                          return 'Enter a custom cron expression';
                                        }
                                      })()
                                    : (() => {
                                        try {
                                          const currentCron = instance.schedule || '0 */6 * * *';
                                          const description = cronstrue.toString(currentCron, { use24HourTimeFormat: true });
                                          return description;
                                        } catch {
                                          return '';
                                        }
                                      })()}
                                </Text>
                              </Flex>
                            )}
                          </Flex>
                        </Card>
                      );
                    })}
                  </Flex>
                )}

                {getInstances('radarr').length === 0 && getInstances('sonarr').length === 0 && getInstances('lidarr').length === 0 && getInstances('readarr').length === 0 && (
                  <Text size="2" color="gray" style={{ fontStyle: 'italic' }}>
                    No instances configured. Add instances in the Applications tab to configure per-instance scheduling.
                  </Text>
                )}
              </Flex>
            </Card>
          </Tabs.Content>

          <Tabs.Content value="advanced" style={{ paddingTop: '1rem' }}>
            <Card>
              <Flex direction="column" gap="4" p="4">
                <Heading size="5">Advanced</Heading>
                <Separator />

                <Flex direction="column" gap="2">
                  <Text size="2" weight="medium">Reset Configuration</Text>
                  <Text size="1" color="gray">
                    Restore the configuration file to its default values. This will remove all configured instances and custom settings.
                  </Text>
                  {confirmingResetConfig ? (
                    <Flex gap="2" align="center">
                      <Text size="1" color="gray">Confirm reset?</Text>
                      <Button
                        variant="solid"
                        size="2"
                        color="red"
                        onClick={() => resetConfigMutation.mutate()}
                        disabled={resetConfigMutation.isPending}
                      >
                        Confirm
                      </Button>
                      <Button
                        variant="outline"
                        size="2"
                        onClick={() => setConfirmingResetConfig(false)}
                        disabled={resetConfigMutation.isPending}
                      >
                        Cancel
                      </Button>
                    </Flex>
                  ) : (
                    <Button
                      variant="outline"
                      color="red"
                      size="2"
                      onClick={() => setConfirmingResetConfig(true)}
                      disabled={resetConfigMutation.isPending}
                    >
                      Reset Config
                    </Button>
                  )}
                </Flex>

                <Separator />

                <Flex direction="column" gap="2">
                  <Text size="2" weight="medium">Intro Hints</Text>
                  <Text size="1" color="gray">
                    Show the introductory hints at the top of the Settings page again.
                  </Text>
                  <Button
                    variant="outline"
                    size="2"
                    onClick={() => {
                      setShowIntroCallout(true);
                      setShowHintCallout(true);
                      try {
                        localStorage.removeItem('scoutarr_settings_intro_dismissed');
                        localStorage.removeItem('scoutarr_settings_hint_dismissed');
                      } catch {
                        // ignore
                      }
                    }}
                  >
                    Show Intro Hints
                  </Button>
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
