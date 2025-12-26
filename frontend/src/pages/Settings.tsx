import { useState, useEffect, useRef, useCallback } from 'react';
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
  Tooltip,
  AlertDialog
} from '@radix-ui/themes';
import * as Collapsible from '@radix-ui/react-collapsible';
import { CheckIcon, CrossCircledIcon, PlusIcon, TrashIcon, ChevronDownIcon, ChevronRightIcon, ReloadIcon, QuestionMarkCircledIcon } from '@radix-ui/react-icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { showErrorToast, showSuccessToast } from '../utils/toast';
import validator from 'validator';
import axios from 'axios';
import type { Config } from '../types/config';
import type { StatusResponse } from '../types/api';
import { configSchema } from '../schemas/configSchema';
import { ZodError } from 'zod';
import { getErrorMessage } from '../utils/helpers';
import { CRON_PRESETS, getPresetFromSchedule, MAX_INSTANCES_PER_APP, APP_TYPES, CRON_PRESET_OPTIONS, AUTO_RELOAD_DELAY_MS } from '../utils/constants';
import { AppIcon } from '../components/icons/AppIcon';
import { ConnectionStatusBadges } from '../components/ConnectionStatusBadges';
import { useNavigation } from '../contexts/NavigationContext';

function Settings() {
  const queryClient = useQueryClient();
  const { handleNavigation: baseHandleNavigation } = useNavigation();
  const [config, setConfig] = useState<Config | null>(null);
  const [testResults, setTestResults] = useState<Record<string, { status: boolean | null; testing: boolean; version?: string; appName?: string }>>({});
  const [schedulerPreset, setSchedulerPreset] = useState<string>('custom');
  const [activeTab, setActiveTab] = useState<string>(() => {
    try {
      const savedTab = localStorage.getItem('scoutarr_settings_active_tab');
      return savedTab || 'applications';
    } catch {
      return 'applications';
    }
  });
  const [selectedAppType, setSelectedAppType] = useState<'radarr' | 'sonarr' | 'lidarr' | 'readarr'>('radarr');
  const [expandedInstances, setExpandedInstances] = useState<Set<string>>(new Set());
  const [confirmingClearTags, setConfirmingClearTags] = useState<string | null>(null);
  const [confirmingDeleteInstance, setConfirmingDeleteInstance] = useState<string | null>(null);
  const [confirmingResetApp, setConfirmingResetApp] = useState<boolean>(false);
  const [qualityProfiles, setQualityProfiles] = useState<Record<string, { id: number; name: string }[]>>({});
  const [loadingProfiles, setLoadingProfiles] = useState<Record<string, boolean>>({});
  const [showUnsavedDialog, setShowUnsavedDialog] = useState(false);
  const [pendingNavigation, setPendingNavigation] = useState<string | null>(null);
  const [pendingTab, setPendingTab] = useState<string | null>(null);
  const loadedConfigRef = useRef<Config | null>(null);

  // Load config with react-query
  const { data: loadedConfig, isLoading: loading, error: loadError, refetch: refetchConfig } = useQuery<Config>({
    queryKey: ['config'],
    queryFn: async () => {
      const response = await axios.get('/api/config');
      return normalizeConfig(response.data);
    },
    refetchOnWindowFocus: true,
  });

  // Fetch status
  const { data: statusData } = useQuery<StatusResponse>({
    queryKey: ['status'],
    queryFn: async () => {
      const response = await axios.get('/api/status');
      return response.data;
    },
  });

  const connectionStatus = statusData || {};

  // Update local config when loaded config changes
  useEffect(() => {
    if (loadedConfig) {
      setConfig(loadedConfig);
      loadedConfigRef.current = loadedConfig;
      if (loadedConfig.scheduler?.schedule) {
        setSchedulerPreset(getPresetFromSchedule(loadedConfig.scheduler.schedule));
      }
    }
  }, [loadedConfig]);

  // Check if there are unsaved changes
  const hasUnsavedChanges = useCallback((): boolean => {
    if (!config || !loadedConfigRef.current) return false;
    return JSON.stringify(config) !== JSON.stringify(loadedConfigRef.current);
  }, [config]);

  // Handle tab change with unsaved changes check
  const handleTabChange = useCallback((newTab: string) => {
    if (hasUnsavedChanges() && activeTab !== newTab) {
      setPendingTab(newTab);
      setShowUnsavedDialog(true);
    } else {
      setActiveTab(newTab);
    }
  }, [hasUnsavedChanges, activeTab]);

  // Handle navigation with unsaved changes check
  const handleNavigation = useCallback((path: string) => {
    if (hasUnsavedChanges()) {
      setPendingNavigation(path);
      setShowUnsavedDialog(true);
    } else {
      baseHandleNavigation(path);
    }
  }, [hasUnsavedChanges, baseHandleNavigation]);

  // Confirm navigation/tab change (discard changes)
  const confirmDiscardChanges = useCallback(() => {
    if (pendingNavigation) {
      baseHandleNavigation(pendingNavigation);
      setPendingNavigation(null);
    }
    if (pendingTab) {
      setActiveTab(pendingTab);
      setPendingTab(null);
    }
    setShowUnsavedDialog(false);
  }, [pendingNavigation, pendingTab, baseHandleNavigation]);

  // Cancel navigation/tab change
  const cancelDiscardChanges = useCallback(() => {
    setPendingNavigation(null);
    setPendingTab(null);
    setShowUnsavedDialog(false);
  }, []);

  // Load cached quality profiles on mount
  useEffect(() => {
    const loadCachedProfiles = async () => {
      try {
        const response = await axios.get('/api/config/quality-profiles');
        const cachedProfiles = response.data;

        // Just set the cached profiles without validation
        // The cache service on the backend already validates against current config
        setQualityProfiles(cachedProfiles);
      } catch (error) {
        // Silently fail - cache might not exist yet
      }
    };

    loadCachedProfiles();
  }, []); // Only run once on mount

  // Persist active tab to localStorage whenever it changes
  useEffect(() => {
    try {
      localStorage.setItem('scoutarr_settings_active_tab', activeTab);
    } catch {
      // Ignore storage errors
    }
  }, [activeTab]);

  // Handle browser beforeunload event for unsaved changes
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges()) {
        e.preventDefault();
        e.returnValue = ''; // Chrome requires returnValue to be set
        return '';
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [hasUnsavedChanges]);

  // Save config mutation with validation
  const saveConfigMutation = useMutation({
    mutationFn: async (configToSave: Config) => {
      // Validate config with zod
      try {
        configSchema.parse(configToSave);
      } catch (error: unknown) {
        if (error instanceof ZodError) {
          const errorMessages = error.issues.map((e) => {
            const path = e.path.length > 0 ? e.path.join('.') : 'root';
            return `${path}: ${e.message}`;
          }).join(', ');
          throw new Error(`Validation failed: ${errorMessages}`);
        }
        // Fallback for non-Zod errors
        const errorMessage = error instanceof Error ? error.message : 'Unknown validation error';
        throw new Error(`Validation failed: ${errorMessage}`);
      }
      await axios.put('/api/config', configToSave);
    },
    onSuccess: (_, configToSave) => {
      toast.success('Configuration saved successfully!');
      // Update ref with the saved config
      if (configToSave) {
        loadedConfigRef.current = configToSave;
      }
      queryClient.invalidateQueries({ queryKey: ['config'] });
      queryClient.invalidateQueries({ queryKey: ['manualRunPreview'] });
      refetchConfig();
    },
    onError: (error: unknown) => {
      showErrorToast('Failed to save config: ' + getErrorMessage(error));
    },
  });

  const saveConfig = async () => {
    if (!config) return;
    saveConfigMutation.mutate(config);
  };

  // Reset app mutation (clears config, quality profiles cache, stats, logs, and localStorage)
  const resetAppMutation = useMutation({
    mutationFn: async () => {
      await axios.post('/api/config/reset-app');
    },
    onSuccess: () => {
      // Clear localStorage to reset UI state
      try {
        localStorage.removeItem('scoutarr_settings_active_tab');
        // Clear any other potential localStorage keys
        const keysToRemove: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && key.startsWith('scoutarr_')) {
            keysToRemove.push(key);
          }
        }
        keysToRemove.forEach(key => localStorage.removeItem(key));
      } catch (error) {
        // Ignore localStorage errors
      }
      
      toast.success('App reset completed - all data cleared. Reloading...');
      queryClient.invalidateQueries({ queryKey: ['config'] });
      queryClient.invalidateQueries({ queryKey: ['stats'] });
      refetchConfig();
      setConfirmingResetApp(false);
      
      // Reload the page after a short delay to ensure fresh UI state
      setTimeout(() => {
        window.location.href = '/';
      }, AUTO_RELOAD_DELAY_MS);
    },
    onError: (error: unknown) => {
      showErrorToast('Failed to reset app: ' + getErrorMessage(error));
      setConfirmingResetApp(false);
    },
  });

  // Clear tags mutation
  const clearTagsMutation = useMutation({
    mutationFn: async ({ app, instanceId }: { app: string; instanceId: string }) => {
      await axios.post(`/api/config/clear-tags/${app}/${instanceId}`);
    },
    onSuccess: () => {
      showSuccessToast('Tags cleared successfully');
      setConfirmingClearTags(null);
    },
    onError: (error: unknown) => {
      showErrorToast('Failed to clear tags: ' + getErrorMessage(error));
      setConfirmingClearTags(null);
    },
  });

  // Type for instance configs
  type StarrInstanceConfig = RadarrInstance | SonarrInstance | LidarrInstance | ReadarrInstance;

  // Helper to get next available instance ID
  const getNextInstanceId = (_app: 'radarr' | 'sonarr' | 'lidarr' | 'readarr', instances: StarrInstanceConfig[]): number => {
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
    
    // Ensure notifications object exists with all required fields
    if (!normalized.notifications) {
      normalized.notifications = {
        discordWebhook: '',
        notifiarrPassthroughWebhook: '',
        notifiarrPassthroughDiscordChannelId: '',
        pushoverUserKey: '',
        pushoverApiToken: ''
      };
    } else {
      // Ensure all notification fields are strings (default to empty string if undefined)
      normalized.notifications = {
        discordWebhook: normalized.notifications.discordWebhook ?? '',
        notifiarrPassthroughWebhook: normalized.notifications.notifiarrPassthroughWebhook ?? '',
        notifiarrPassthroughDiscordChannelId: normalized.notifications.notifiarrPassthroughDiscordChannelId ?? '',
        pushoverUserKey: normalized.notifications.pushoverUserKey ?? '',
        pushoverApiToken: normalized.notifications.pushoverApiToken ?? ''
      };
    }
    
    // Ensure applications object exists
    if (!normalized.applications) {
      normalized.applications = { radarr: [], sonarr: [], lidarr: [], readarr: [] };
    }
    
    // Ensure all app arrays exist and normalize instances
    normalized.applications.radarr = (normalized.applications.radarr || []).map((inst: RadarrInstance, idx: number) => ({
      ...inst,
      instanceId: inst.instanceId || idx + 1
    }));

    normalized.applications.sonarr = (normalized.applications.sonarr || []).map((inst: SonarrInstance, idx: number) => ({
      ...inst,
      instanceId: inst.instanceId || idx + 1
    }));
    
    normalized.applications.lidarr = (normalized.applications.lidarr || []).map((inst: LidarrInstance, idx: number) => ({
      ...inst,
      instanceId: inst.instanceId || idx + 1
    }));
    
    normalized.applications.readarr = (normalized.applications.readarr || []).map((inst: ReadarrInstance, idx: number) => ({
      ...inst,
      instanceId: inst.instanceId || idx + 1
    }));
    
    return normalized;
  };

  // Get instances for an app
  const getInstances = (app: 'radarr' | 'sonarr' | 'lidarr' | 'readarr'): StarrInstanceConfig[] => {
    if (!config) return [];
    return config.applications[app] as StarrInstanceConfig[];
  };

  // Update instance config
  const updateInstanceConfig = (app: 'radarr' | 'sonarr' | 'lidarr' | 'readarr', instanceId: string, field: string, value: unknown) => {
    if (!config) return;
    const instances = getInstances(app);
    const currentInstance = instances.find(inst => inst.id === instanceId);
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
    
    // Clear test result and quality profiles when config changes
    if (field === 'url' || field === 'apiKey') {
      setTestResults(prev => ({
        ...prev,
        [`${app}-${instanceId}`]: { status: null, testing: false }
      }));
      
      // Clear quality profiles cache when URL or API key changes
      const urlChanged = field === 'url' && currentInstance?.url !== value;
      const apiKeyChanged = field === 'apiKey' && currentInstance?.apiKey !== value;
      
      if (urlChanged || apiKeyChanged) {
        // Clear profiles if URL or API key is removed or changed
        // Backend cache will be invalidated automatically on config save
        setQualityProfiles(prev => {
          const newProfiles = { ...prev };
          delete newProfiles[`${app}-${instanceId}`];
          return newProfiles;
        });
      }
    }
  };

  // Add new instance
  const addInstance = (app: 'radarr' | 'sonarr' | 'lidarr' | 'readarr') => {
    if (!config) return;
    const instances = getInstances(app);
    // Limit instances per app
    if (instances.length >= MAX_INSTANCES_PER_APP) {
      showErrorToast(`Maximum of ${MAX_INSTANCES_PER_APP} ${app.charAt(0).toUpperCase() + app.slice(1)} instances allowed.`);
      return;
    }
    const newId = `${app}-${Date.now()}`;
    const nextInstanceId = getNextInstanceId(app, instances);
    
    let defaultConfig: StarrInstanceConfig;
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
    let appConfig: StarrInstanceConfig | undefined;
    if (instanceId && Array.isArray(config.applications[app as 'radarr' | 'sonarr' | 'lidarr' | 'readarr'])) {
      const instances = config.applications[app as 'radarr' | 'sonarr' | 'lidarr' | 'readarr'] as StarrInstanceConfig[];
      appConfig = instances.find(inst => inst.id === instanceId);
    } else {
      const appConfigs = config.applications[app as keyof Config['applications']];
      appConfig = Array.isArray(appConfigs) && appConfigs.length > 0 ? appConfigs[0] : undefined;
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
          <Flex gap="2" align="center">
            <Badge color={testResult.status ? 'green' : 'red'}>
              {testResult.status ? <CheckIcon /> : <CrossCircledIcon />}
              {testResult.status ? 'Connected' : 'Failed'}
            </Badge>
            {testResult.status && testResult.version && (
              <Text size="2" color="gray">
                v{testResult.version}
              </Text>
            )}
          </Flex>
        )}
        {!canTest && (
          <Text size="2" color="gray">
            Configure URL and API Key first
          </Text>
        )}
      </Flex>
    );
  };

  const fetchQualityProfiles = async (app: string, instanceId: string, url: string, apiKey: string, forceRefresh: boolean = false) => {
    const key = `${app}-${instanceId}`;
    
    if (!url || !apiKey) {
      setQualityProfiles(prev => {
        const newProfiles = { ...prev };
        delete newProfiles[key];
        return newProfiles;
      });
      return;
    }

    // Validate URL
    if (!validator.isURL(url, { require_protocol: true })) {
      return;
    }

    setLoadingProfiles(prev => ({ ...prev, [key]: true }));
    try {
      const response = await axios.post(`/api/config/quality-profiles/${app}`, {
        url,
        apiKey,
        instanceId,
        forceRefresh
      });
      setQualityProfiles(prev => ({
        ...prev,
        [key]: response.data.map((p: { id: number; name: string }) => ({ id: p.id, name: p.name }))
      }));
    } catch (error: unknown) {
      // Silently fail - don't show error toast as this is called automatically
      setQualityProfiles(prev => {
        const newProfiles = { ...prev };
        delete newProfiles[key];
        return newProfiles;
      });
    } finally {
      setLoadingProfiles(prev => ({ ...prev, [key]: false }));
    }
  };

  const testConnection = async (app: string, instanceId?: string) => {
    if (!config) return;
    const key = instanceId ? `${app}-${instanceId}` : app;
    let appConfig: StarrInstanceConfig | undefined;
    if (instanceId && Array.isArray(config.applications[app as 'radarr' | 'sonarr' | 'lidarr' | 'readarr'])) {
      const instances = config.applications[app as 'radarr' | 'sonarr' | 'lidarr' | 'readarr'] as StarrInstanceConfig[];
      appConfig = instances.find(inst => inst.id === instanceId);
    } else {
      const appConfigs = config.applications[app as keyof Config['applications']];
      appConfig = Array.isArray(appConfigs) && appConfigs.length > 0 ? appConfigs[0] : undefined;
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
        showErrorToast('Invalid URL format');
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
        [key]: { 
          status: success, 
          testing: false,
          version: response.data.version,
          appName: response.data.appName
        }
      }));
      if (success) {
        const versionText = response.data.version ? ` (v${response.data.version})` : '';
        toast.success(`Connection test successful${versionText}`);
        // Fetch quality profiles after successful connection test
        if (instanceId && appConfig.url && appConfig.apiKey) {
          fetchQualityProfiles(app, instanceId, appConfig.url, appConfig.apiKey, true);
        }
      } else {
        showErrorToast('Connection test failed');
      }
    } catch (error: unknown) {
      setTestResults(prev => ({
        ...prev,
        [key]: { status: false, testing: false }
      }));
      showErrorToast('Connection test failed: ' + getErrorMessage(error));
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

  // Helper to render instance schedule configuration
  const renderInstanceSchedule = (appType: 'radarr' | 'sonarr' | 'lidarr' | 'readarr', instance: StarrInstanceConfig) => {
    const instanceSchedulePreset = instance.schedule ? getPresetFromSchedule(instance.schedule) : 'custom';
    
    return (
      <Card key={instance.id} variant="surface">
        <Flex direction="column" gap="3" p="3">
          <Flex direction="row" align="center" justify="between">
            <Text size="3" weight="medium">{instance.name}</Text>
            <Flex direction="row" align="center" gap="2">
              <Text size="2">Enable Schedule</Text>
              <Switch
                checked={instance.scheduleEnabled || false}
                onCheckedChange={(checked) => {
                  updateInstanceConfig(appType, instance.id, 'scheduleEnabled', checked);
                  if (checked && !instance.schedule) {
                    updateInstanceConfig(appType, instance.id, 'schedule', '0 */6 * * *');
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
                  updateInstanceConfig(appType, instance.id, 'schedule', schedule);
                }}
              >
                <Select.Trigger />
                <Select.Content position="popper" sideOffset={5}>
                  {CRON_PRESET_OPTIONS.map(option => (
                    <Select.Item key={option.value} value={option.value}>
                      {option.label}
                    </Select.Item>
                  ))}
                </Select.Content>
              </Select.Root>
              {instanceSchedulePreset === 'custom' && (
                <Flex direction="column" gap="1">
                  <TextField.Root
                    value={instance.schedule || '0 */6 * * *'}
                    onChange={(e) => {
                      updateInstanceConfig(appType, instance.id, 'schedule', e.target.value);
                    }}
                    placeholder="0 */6 * * *"
                  />
                  <Text size="1" color="gray">
                    <a href="https://crontab.guru/" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent-9)', textDecoration: 'none' }}>
                      Need help? Visit crontab.guru →
                    </a>
                  </Text>
                </Flex>
              )}
            </Flex>
          )}
        </Flex>
      </Card>
    );
  };

  return (
    <div style={{ width: '100%', paddingTop: 0, marginTop: 0 }}>
      <Flex direction="column" gap="3">
        <Tabs.Root value={activeTab} onValueChange={handleTabChange}>
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
                  <Text size="2" weight="medium">Application Type</Text>
                  <Select.Root value={selectedAppType} onValueChange={(value) => setSelectedAppType(value as 'radarr' | 'sonarr' | 'lidarr' | 'readarr')}>
                    <Select.Trigger style={{ minWidth: '120px' }} />
                    <Select.Content position="popper" sideOffset={5}>
                      <Select.Item value="radarr">
                        <Flex align="center" gap="2">
                          <AppIcon app="radarr" size={16} variant="light" />
                          Radarr
                        </Flex>
                      </Select.Item>
                      <Select.Item value="sonarr">
                        <Flex align="center" gap="2">
                          <AppIcon app="sonarr" size={16} variant="light" />
                          Sonarr
                        </Flex>
                      </Select.Item>
                      <Select.Item value="lidarr">
                        <Flex align="center" gap="2">
                          <AppIcon app="lidarr" size={16} variant="light" />
                          Lidarr
                        </Flex>
                      </Select.Item>
                      <Select.Item value="readarr">
                        <Flex align="center" gap="2">
                          <AppIcon app="readarr" size={16} variant="light" />
                          Readarr
                        </Flex>
                      </Select.Item>
                    </Select.Content>
                  </Select.Root>
                </Flex>
              </Flex>
              <Flex gap="2" wrap="wrap">
                <ConnectionStatusBadges connectionStatus={connectionStatus} />
              </Flex>
              <Grid columns={{ initial: '1', md: '2' }} gap="3">
                {(() => {
                  const appInfo = getAppInfo(selectedAppType);
                  return getInstances(selectedAppType).map((instance) => {
                    const instanceKey = `${selectedAppType}-${instance.id}`;
                    const isExpanded = expandedInstances.has(instanceKey);
                    
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
                                <Flex align="center" gap="2">
                                  <AppIcon app={selectedAppType} size={18} variant="light" />
                                  <Text size="3" weight="bold">{instance.name}</Text>
                                </Flex>
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
                                <Flex align="center" gap="1">
                                  <Text size="2" weight="medium">Enable Instance</Text>
                                  <Tooltip content="When enabled, this instance will be included in search operations. When disabled, it will be skipped.">
                                    <QuestionMarkCircledIcon style={{ cursor: 'help', color: 'var(--gray-9)', width: '14px', height: '14px' }} />
                                  </Tooltip>
                                </Flex>
                                <Switch
                                  checked={instance.enabled !== false}
                                  onCheckedChange={(checked) => updateInstanceConfig(selectedAppType, instance.id, 'enabled', checked)}
                                />
                              </Flex>
                              <Separator />
                              <Flex direction="column" gap="2">
                                <Flex align="center" gap="1">
                                  <Text size="2" weight="medium">Name (required)</Text>
                                  <Tooltip content={`A unique name to identify this instance (e.g., 'Main ${appInfo.name}', '4K ${appInfo.name}'). Must be unique across all instances.`}>
                                    <QuestionMarkCircledIcon style={{ cursor: 'help', color: 'var(--gray-9)', width: '14px', height: '14px' }} />
                                  </Tooltip>
                                </Flex>
                                <TextField.Root
                                  value={instance.name || ''}
                                  onChange={(e) => updateInstanceConfig(selectedAppType, instance.id, 'name', e.target.value)}
                                  placeholder={`Enter unique instance name`}
                                />
                              </Flex>

                              <Flex direction="column" gap="2">
                                <Flex align="center" gap="1">
                                  <Text size="2" weight="medium">{appInfo.name} URL</Text>
                                  <Tooltip content={`The base URL where your ${appInfo.name} instance is accessible (e.g., http://localhost:${appInfo.defaultPort} or https://${selectedAppType}.example.com)`}>
                                    <QuestionMarkCircledIcon style={{ cursor: 'help', color: 'var(--gray-9)', width: '14px', height: '14px' }} />
                                  </Tooltip>
                                </Flex>
                                <TextField.Root
                                  placeholder={`http://localhost:${appInfo.defaultPort}`}
                                  value={instance.url || ''}
                                  onChange={(e) => updateInstanceConfig(selectedAppType, instance.id, 'url', e.target.value)}
                                />
                              </Flex>

                              <Flex direction="column" gap="2">
                                <Flex align="center" gap="1">
                                  <Text size="2" weight="medium">API Key</Text>
                                  <Tooltip content={`Your ${appInfo.name} API key found in Settings → General → Security → API Key (must be 32 characters)`}>
                                    <QuestionMarkCircledIcon style={{ cursor: 'help', color: 'var(--gray-9)', width: '14px', height: '14px' }} />
                                  </Tooltip>
                                </Flex>
                                <TextField.Root
                                  type="password"
                                  placeholder="API Key"
                                  value={instance.apiKey || ''}
                                  onChange={(e) => updateInstanceConfig(selectedAppType, instance.id, 'apiKey', e.target.value)}
                                />
                              </Flex>

                              {renderTestButton(selectedAppType, instance.id)}

                              <Flex direction="column" gap="2">
                                <Flex align="center" gap="1">
                                  <Text size="2" weight="medium">Number of {appInfo.mediaTypePlural.charAt(0).toUpperCase() + appInfo.mediaTypePlural.slice(1)} to Search</Text>
                                  <Tooltip content={`How many ${appInfo.mediaTypePlural} to randomly select and search for upgrades each time the script runs. Use 'max' to search all matching ${appInfo.mediaTypePlural}.`}>
                                    <QuestionMarkCircledIcon style={{ cursor: 'help', color: 'var(--gray-9)', width: '14px', height: '14px' }} />
                                  </Tooltip>
                                </Flex>
                                <TextField.Root
                                  type="number"
                                  value={(instance.count || 5).toString()}
                                  onChange={(e) => updateInstanceConfig(selectedAppType, instance.id, 'count', parseInt(e.target.value) || 5)}
                                />
                              </Flex>

                              <Flex direction="column" gap="2">
                                <Flex align="center" gap="1">
                                  <Text size="2" weight="medium">Tag Name (optional)</Text>
                                  <Tooltip content={`The tag name to use for tracking which ${appInfo.mediaTypePlural} have been searched. This tag will be created automatically if it doesn't exist.`}>
                                    <QuestionMarkCircledIcon style={{ cursor: 'help', color: 'var(--gray-9)', width: '14px', height: '14px' }} />
                                  </Tooltip>
                                </Flex>
                                <TextField.Root
                                  value={instance.tagName || ''}
                                  onChange={(e) => updateInstanceConfig(selectedAppType, instance.id, 'tagName', e.target.value)}
                                />
                              </Flex>

                              <Flex direction="column" gap="2">
                                <Flex align="center" gap="1">
                                  <Text size="2" weight="medium">Ignore Tag (optional)</Text>
                                  <Tooltip content={`${appInfo.mediaType} with this tag will be excluded from upgrade searches. Leave empty to include all ${appInfo.mediaTypePlural} matching other criteria.`}>
                                    <QuestionMarkCircledIcon style={{ cursor: 'help', color: 'var(--gray-9)', width: '14px', height: '14px' }} />
                                  </Tooltip>
                                </Flex>
                                <TextField.Root
                                  value={instance.ignoreTag || ''}
                                  onChange={(e) => updateInstanceConfig(selectedAppType, instance.id, 'ignoreTag', e.target.value)}
                                />
                              </Flex>

                              <Flex direction="row" align="center" justify="between" gap="2">
                                <Flex align="center" gap="1">
                                  <Text size="2" weight="medium">Search Monitored {appInfo.mediaType} Only</Text>
                                  <Tooltip content={`When enabled, only ${appInfo.mediaTypePlural} that are currently monitored will be considered for upgrades.`}>
                                    <QuestionMarkCircledIcon style={{ cursor: 'help', color: 'var(--gray-9)', width: '14px', height: '14px' }} />
                                  </Tooltip>
                                </Flex>
                                <Switch
                                  checked={instance.monitored ?? true}
                                  onCheckedChange={(checked) => updateInstanceConfig(selectedAppType, instance.id, 'monitored', checked)}
                                />
                              </Flex>

                              {selectedAppType === 'radarr' && (
                                <Flex direction="column" gap="2">
                                  <Flex align="center" gap="1">
                                    <Text size="2" weight="medium">Movie Status</Text>
                                    <Tooltip content="Only movies with this status or higher will be considered for upgrades. Released is recommended for most use cases.">
                                      <QuestionMarkCircledIcon style={{ cursor: 'help', color: 'var(--gray-9)', width: '14px', height: '14px' }} />
                                    </Tooltip>
                                  </Flex>
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
                                </Flex>
                              )}
                              
                              {selectedAppType === 'sonarr' && (
                                <Flex direction="column" gap="2">
                                  <Flex align="center" gap="1">
                                    <Text size="2" weight="medium">Series Status</Text>
                                    <Tooltip content="Only series with this status will be considered for upgrades. Leave as 'Any' to include all statuses.">
                                      <QuestionMarkCircledIcon style={{ cursor: 'help', color: 'var(--gray-9)', width: '14px', height: '14px' }} />
                                    </Tooltip>
                                  </Flex>
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
                                </Flex>
                              )}

                              {(selectedAppType === 'lidarr' || selectedAppType === 'readarr') && (
                                <Flex direction="column" gap="2">
                                  <Flex align="center" gap="1">
                                    <Text size="2" weight="medium">{appInfo.mediaType} Status</Text>
                                    <Tooltip content={`Only ${appInfo.mediaTypePlural.toLowerCase()} with this status will be considered for upgrades. Leave as 'Any' to include all statuses.`}>
                                      <QuestionMarkCircledIcon style={{ cursor: 'help', color: 'var(--gray-9)', width: '14px', height: '14px' }} />
                                    </Tooltip>
                                  </Flex>
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
                                </Flex>
                              )}

                              <Flex direction="column" gap="2">
                                <Flex align="center" gap="1">
                                  <Text size="2" weight="medium">Quality Profile</Text>
                                  <Tooltip content={`Only ${appInfo.mediaTypePlural.toLowerCase()} using this specific quality profile will be considered. Leave empty to include all quality profiles.`}>
                                    <QuestionMarkCircledIcon style={{ cursor: 'help', color: 'var(--gray-9)', width: '14px', height: '14px' }} />
                                  </Tooltip>
                                </Flex>
                                <Flex gap="2" align="center" style={{ width: '100%' }}>
                                  <Flex style={{ flex: 1, minWidth: 0 }}>
                                      {(() => {
                                        const profileKey = `${selectedAppType}-${instance.id}`;
                                        const profiles = qualityProfiles[profileKey] || [];
                                        const isLoading = loadingProfiles[profileKey];
                                        const hasUrlAndApiKey = instance.url && instance.apiKey;
                                        
                                        if (!hasUrlAndApiKey) {
                                          return (
                                            <Select.Root
                                              value={undefined}
                                              onValueChange={() => {}}
                                              disabled
                                            >
                                              <Select.Trigger placeholder="Configure URL and API Key first" style={{ width: '100%' }} />
                                            </Select.Root>
                                          );
                                        }
                                        
                                        if (isLoading) {
                                          return (
                                            <Select.Root disabled>
                                              <Select.Trigger placeholder="Loading profiles..." style={{ width: '100%' }} />
                                            </Select.Root>
                                          );
                                        }
                                        
                                        // Use a special value "__all__" to represent "all profiles" (empty string in config)
                                        const selectValue = instance.qualityProfileName || '__all__';
                                        
                                        return (
                                          <Select.Root
                                            value={selectValue}
                                            onValueChange={(value) => {
                                              // Convert "__all__" back to empty string for config
                                              const configValue = value === '__all__' ? '' : value;
                                              updateInstanceConfig(selectedAppType, instance.id, 'qualityProfileName', configValue);
                                            }}
                                          >
                                            <Select.Trigger placeholder="All quality profiles" style={{ width: '100%' }} />
                                            <Select.Content position="popper" sideOffset={5}>
                                              <Select.Item value="__all__">All quality profiles</Select.Item>
                                              {profiles.map((profile) => (
                                                <Select.Item key={profile.id} value={profile.name}>
                                                  {profile.name}
                                                </Select.Item>
                                              ))}
                                            </Select.Content>
                                          </Select.Root>
                                        );
                                      })()}
                                    </Flex>
                                  {(() => {
                                    const profileKey = `${selectedAppType}-${instance.id}`;
                                    const isLoading = loadingProfiles[profileKey];
                                    const hasUrlAndApiKey = instance.url && instance.apiKey;
                                    
                                    if (!hasUrlAndApiKey) {
                                      return null;
                                    }
                                    
                                    return (
                                      <Tooltip content="Refresh quality profiles">
                                        <Button
                                          variant="soft"
                                          size="1"
                                          onClick={async () => {
                                            // Clear existing profiles to show loading state
                                            setQualityProfiles(prev => {
                                              const newProfiles = { ...prev };
                                              delete newProfiles[profileKey];
                                              return newProfiles;
                                            });
                                            // Fetch fresh profiles with force refresh
                                            await fetchQualityProfiles(selectedAppType, instance.id, instance.url, instance.apiKey, true);
                                          }}
                                          disabled={isLoading}
                                          style={{ minWidth: '32px', width: '32px', height: '32px', padding: 0, flexShrink: 0 }}
                                        >
                                          {isLoading ? (
                                            <Spinner size="1" />
                                          ) : (
                                            <ReloadIcon width="14" height="14" />
                                          )}
                                        </Button>
                                      </Tooltip>
                                    );
                                  })()}
                                </Flex>
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
                                      onClick={() => {
                                        clearTagsMutation.mutate({ app: selectedAppType, instanceId: instance.id });
                                      }}
                                      disabled={clearTagsMutation.isPending}
                                    >
                                      {clearTagsMutation.isPending ? 'Clearing...' : 'Confirm'}
                                    </Button>
                                    <Button
                                      variant="outline"
                                      size="2"
                                      onClick={() => setConfirmingClearTags(null)}
                                      disabled={clearTagsMutation.isPending}
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
                  });
                })()}
              </Grid>
            </Flex>
          </Tabs.Content>

          <Tabs.Content value="notifications" style={{ paddingTop: '1rem' }}>
            <Card>
              <Flex direction="column" gap="4" p="4">
                <Heading size="5">Notification Configuration</Heading>
                <Separator />

                <Flex direction="column" gap="1">
                  <Flex align="center" gap="1">
                    <Text size="2" weight="medium">Discord Webhook URL (optional)</Text>
                    <Tooltip content="Webhook URL where Discord notifications will be sent. Leave empty to disable.">
                      <QuestionMarkCircledIcon style={{ cursor: 'help', color: 'var(--gray-9)', width: '14px', height: '14px' }} />
                    </Tooltip>
                  </Flex>
                  <TextField.Root
                    value={config.notifications.discordWebhook}
                    onChange={(e) => updateNotificationConfig('discordWebhook', e.target.value)}
                  />
                </Flex>

                <Flex direction="column" gap="1">
                  <Flex align="center" gap="1">
                    <Text size="2" weight="medium">Notifiarr Passthrough Webhook (optional)</Text>
                    <Tooltip content="Notifiarr passthrough webhook for notifications. Leave empty to disable.">
                      <QuestionMarkCircledIcon style={{ cursor: 'help', color: 'var(--gray-9)', width: '14px', height: '14px' }} />
                    </Tooltip>
                  </Flex>
                  <TextField.Root
                    value={config.notifications.notifiarrPassthroughWebhook}
                    onChange={(e) => updateNotificationConfig('notifiarrPassthroughWebhook', e.target.value)}
                  />
                </Flex>

                <Flex direction="column" gap="1">
                  <Flex align="center" gap="1">
                    <Text size="2" weight="medium">Notifiarr Discord Channel ID (optional)</Text>
                    <Tooltip content="Discord channel ID for Notifiarr notifications (17–19 digits). Required if a Notifiarr webhook is set.">
                      <QuestionMarkCircledIcon style={{ cursor: 'help', color: 'var(--gray-9)', width: '14px', height: '14px' }} />
                    </Tooltip>
                  </Flex>
                  <TextField.Root
                    value={config.notifications.notifiarrPassthroughDiscordChannelId}
                    onChange={(e) => updateNotificationConfig('notifiarrPassthroughDiscordChannelId', e.target.value)}
                  />
                </Flex>

                <Flex direction="column" gap="1">
                  <Flex align="center" gap="1">
                    <Text size="2" weight="medium">Pushover User Key (optional)</Text>
                    <Tooltip content="Your Pushover user key for notifications. Leave empty to disable.">
                      <QuestionMarkCircledIcon style={{ cursor: 'help', color: 'var(--gray-9)', width: '14px', height: '14px' }} />
                    </Tooltip>
                  </Flex>
                  <TextField.Root
                    value={config.notifications.pushoverUserKey}
                    onChange={(e) => updateNotificationConfig('pushoverUserKey', e.target.value)}
                  />
                </Flex>

                <Flex direction="column" gap="1">
                  <Flex align="center" gap="1">
                    <Text size="2" weight="medium">Pushover API Token (optional)</Text>
                    <Tooltip content="Your Pushover application API token. Required if a Pushover user key is set.">
                      <QuestionMarkCircledIcon style={{ cursor: 'help', color: 'var(--gray-9)', width: '14px', height: '14px' }} />
                    </Tooltip>
                  </Flex>
                  <TextField.Root
                    value={config.notifications.pushoverApiToken}
                    onChange={(e) => updateNotificationConfig('pushoverApiToken', e.target.value)}
                  />
                </Flex>
              </Flex>
            </Card>
          </Tabs.Content>

          <Tabs.Content value="scheduler" style={{ paddingTop: '1rem' }}>
            <Card>
              <Flex direction="column" gap="4" p="4">
                <Flex align="center" gap="2">
                  <Heading size="5">Global Schedule</Heading>
                  <Tooltip content="Schedule for all instances. Per-instance schedules override this.">
                    <QuestionMarkCircledIcon style={{ cursor: 'help', color: 'var(--gray-9)', width: '16px', height: '16px' }} />
                  </Tooltip>
                </Flex>
                <Separator />

                <Flex direction="row" align="center" justify="between" gap="2">
                  <Flex align="center" gap="1">
                    <Text size="2" weight="medium">Enable Scheduler</Text>
                    <Tooltip content="Automatically run searches on schedule for instances without per-instance schedules.">
                      <QuestionMarkCircledIcon style={{ cursor: 'help', color: 'var(--gray-9)', width: '14px', height: '14px' }} />
                    </Tooltip>
                  </Flex>
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
                </Flex>

                <Flex direction="row" align="center" justify="between" gap="2">
                  <Flex align="center" gap="1">
                    <Text size="2" weight="medium">Unattended Mode</Text>
                    <Tooltip content="Automatically clear tags and re-filter when no media is found.">
                      <QuestionMarkCircledIcon style={{ cursor: 'help', color: 'var(--gray-9)', width: '14px', height: '14px' }} />
                    </Tooltip>
                  </Flex>
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
                      {CRON_PRESET_OPTIONS.map(option => (
                        <Select.Item key={option.value} value={option.value}>
                          {option.label}
                        </Select.Item>
                      ))}
                    </Select.Content>
                  </Select.Root>
                  {schedulerPreset === 'custom' && (
                    <Flex direction="column" gap="1">
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
                      <Text size="1" color="gray">
                        <a href="https://crontab.guru/" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent-9)', textDecoration: 'none' }}>
                          Need help? Visit crontab.guru →
                        </a>
                      </Text>
                    </Flex>
                  )}
                </Flex>
              </Flex>
            </Card>

            {/* Per-Instance Scheduling */}
            <Card>
              <Flex direction="column" gap="4" p="4">
                <Flex align="center" gap="2">
                  <Heading size="5">Per-Instance Schedule</Heading>
                  <Tooltip content="Set individual schedules per instance. Overrides global schedule when enabled.">
                    <QuestionMarkCircledIcon style={{ cursor: 'help', color: 'var(--gray-9)', width: '16px', height: '16px' }} />
                  </Tooltip>
                </Flex>
                <Separator />

                {/* Render instances for each app type */}
                {APP_TYPES.map(appType => {
                  const instances = getInstances(appType);
                  if (instances.length === 0) return null;
                  
                  const appInfo = getAppInfo(appType);
                  return (
                    <Flex key={appType} direction="column" gap="3">
                      <Heading size="4">{appInfo.name} Instances</Heading>
                      {instances.map(instance => renderInstanceSchedule(appType, instance))}
                    </Flex>
                  );
                })}

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
                  <Text size="2" weight="medium">Reset App</Text>
                  <Text size="1" color="gray">
                    This will completely reset the app to a fresh state like a first-time installation. It will permanently delete all configuration, quality profiles cache, statistics database, log files, and clear browser storage. The app will reload automatically after reset. This action cannot be undone.
                  </Text>
                  {confirmingResetApp ? (
                    <Flex gap="2" align="center" wrap="wrap">
                      <Text size="1" color="red" weight="medium">Are you sure? This will delete all data.</Text>
                      <Flex gap="2">
                        <Button
                          variant="solid"
                          size="2"
                          color="red"
                          onClick={() => resetAppMutation.mutate()}
                          disabled={resetAppMutation.isPending}
                        >
                          Confirm Reset
                        </Button>
                        <Button
                          variant="outline"
                          size="2"
                          onClick={() => setConfirmingResetApp(false)}
                          disabled={resetAppMutation.isPending}
                        >
                          Cancel
                        </Button>
                      </Flex>
                    </Flex>
                  ) : (
                    <Button
                      variant="solid"
                      color="red"
                      size="2"
                      onClick={() => setConfirmingResetApp(true)}
                      disabled={resetAppMutation.isPending}
                    >
                      Reset App
                    </Button>
                  )}
                </Flex>
              </Flex>
            </Card>
          </Tabs.Content>
        </Tabs.Root>
      </Flex>

      {/* Unsaved Changes Dialog */}
      <AlertDialog.Root open={showUnsavedDialog}>
        <AlertDialog.Content maxWidth="450px">
          <AlertDialog.Title>Unsaved Changes</AlertDialog.Title>
          <AlertDialog.Description size="3" mb="4">
            You have unsaved changes. Are you sure you want to leave without saving? Your changes will be lost.
          </AlertDialog.Description>
          <Flex gap="3" justify="end">
            <AlertDialog.Cancel>
              <Button variant="soft" color="gray" onClick={cancelDiscardChanges}>
                Cancel
              </Button>
            </AlertDialog.Cancel>
            <AlertDialog.Action>
              <Button variant="solid" color="red" onClick={confirmDiscardChanges}>
                Discard Changes
              </Button>
            </AlertDialog.Action>
          </Flex>
        </AlertDialog.Content>
      </AlertDialog.Root>
    </div>
  );
}

export default Settings;
