import { useState, useEffect, useRef, useCallback, lazy, Suspense } from 'react';
import { capitalize } from 'es-toolkit';
import {
  Flex,
  Heading,
  Button,
  Card,
  TextField,
  Text,
  Select,
  Separator,
  Tabs,
  Callout,
  Badge,
  Spinner,
  Grid,
  Tooltip,
  AlertDialog,
  Box
} from '@radix-ui/themes';
import { CheckIcon, CrossCircledIcon, PlusIcon, QuestionMarkCircledIcon } from '@radix-ui/react-icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { showErrorToast, showSuccessToast } from '../utils/toast';
import validator from 'validator';
import type { Config } from '../types/config';
import { configSchema } from '../schemas/configSchema';
import { ZodError } from 'zod';
import { getErrorMessage } from '../utils/helpers';
import { AppType, MAX_INSTANCES_PER_APP, AUTO_RELOAD_DELAY_MS } from '../utils/constants';
import { AppIcon } from '../components/icons/AppIcon';
import { useNavigation } from '../contexts/NavigationContext';
import type { SchedulerHistoryEntry } from '../types/api';
import { configService } from '../services/configService';
import { schedulerService } from '../services/schedulerService';
import { buildDefaultInstance, getAppInfo, getNextInstanceId, StarrInstanceConfig } from '../utils/appInfo';
import { InstanceCard } from '../components/InstanceCard';

const LazyTasksTab = lazy(() => import('../components/TasksTab').then(mod => ({ default: mod.TasksTab })));
const LazySchedulerLogs = lazy(() => import('../components/SchedulerLogs').then(mod => ({ default: mod.SchedulerLogs })));

function Settings() {
  const queryClient = useQueryClient();
  const { handleNavigation: baseHandleNavigation, registerNavigationGuard, unregisterNavigationGuard } = useNavigation();
  const [config, setConfig] = useState<Config | null>(null);
  const [testResults, setTestResults] = useState<Record<string, { status: boolean | null; testing: boolean; version?: string; appName?: string }>>({});
  const [activeTab, setActiveTab] = useState<string>(() => {
    try {
      const savedTab = localStorage.getItem('scoutarr_settings_active_tab');
      return savedTab || 'applications';
    } catch {
      return 'applications';
    }
  });
  const [selectedAppType, setSelectedAppType] = useState<AppType>('radarr');
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
    queryFn: () => configService.getConfig(),
    refetchOnWindowFocus: true,
  });

  // Load scheduler status for Tasks tab
  const { data: schedulerStatus, refetch: refetchSchedulerStatus } = useQuery({
    queryKey: ['scheduler-status'],
    queryFn: () => schedulerService.getStatus(),
    refetchInterval: 60000, // Refresh every minute
  });

  // Load scheduler history for Logs tab
  const { data: schedulerHistory = [], refetch: refetchHistory } = useQuery<SchedulerHistoryEntry[]>({
    queryKey: ['schedulerHistory'],
    queryFn: () => schedulerService.getHistory(),
    enabled: true,
    staleTime: Infinity,
  });

  // Update local config when loaded config changes
  useEffect(() => {
    if (loadedConfig) {
      setConfig(loadedConfig);
      loadedConfigRef.current = loadedConfig;
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

  // Confirm navigation/tab change (discard changes)
  const confirmDiscardChanges = useCallback(() => {
    // Reset config to the loaded state to discard changes
    if (loadedConfigRef.current) {
      setConfig(loadedConfigRef.current);
    }

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

  // Persist active tab to localStorage whenever it changes
  useEffect(() => {
    try {
      localStorage.setItem('scoutarr_settings_active_tab', activeTab);
    } catch {
      // Ignore storage errors
    }
  }, [activeTab]);

  // Register navigation guard to check for unsaved changes
  useEffect(() => {
    const navigationGuard = (path: string) => {
      if (hasUnsavedChanges()) {
        setPendingNavigation(path);
        setShowUnsavedDialog(true);
        return false; // Block navigation
      }
      return true; // Allow navigation
    };

    registerNavigationGuard(navigationGuard);

    return () => {
      unregisterNavigationGuard();
    };
  }, [hasUnsavedChanges, registerNavigationGuard, unregisterNavigationGuard]);

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
      await configService.updateConfig(configToSave);
    },
    onSuccess: async (_, configToSave) => {
      toast.success('Configuration saved successfully!');
      // Update ref with the saved config
      if (configToSave) {
        loadedConfigRef.current = configToSave;
      }
      queryClient.invalidateQueries({ queryKey: ['config'] });
      refetchConfig();
    },
    onError: (error: unknown) => {
      showErrorToast('Failed to save config: ' + getErrorMessage(error));
    },
  });

  const saveConfig = async (configToSave?: Config) => {
    const configData = configToSave || config;
    if (!configData) return;
    saveConfigMutation.mutate(configData);
  };

  // Reset app mutation (clears config, quality profiles cache, stats, logs, and localStorage)
  const resetAppMutation = useMutation({
    mutationFn: () => configService.resetAppInstance('all'),
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
    mutationFn: ({ app, instanceId }: { app: string; instanceId: string }) => 
      configService.clearTags(app, instanceId),
    onSuccess: () => {
      showSuccessToast('Tags cleared successfully');
      setConfirmingClearTags(null);
    },
    onError: (error: unknown) => {
      showErrorToast('Failed to clear tags: ' + getErrorMessage(error));
      setConfirmingClearTags(null);
    },
  });

  // Get instances for an app
  const getInstances = (app: AppType): StarrInstanceConfig[] => {
    if (!config) return [];
    return config.applications[app] as StarrInstanceConfig[];
  };

  // Update instance config
  const updateInstanceConfig = (app: AppType, instanceId: string, field: string, value: unknown) => {
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
  const addInstance = (app: AppType) => {
    if (!config) return;
    const instances = getInstances(app);
    // Limit instances per app
    if (instances.length >= MAX_INSTANCES_PER_APP) {
      showErrorToast(`Maximum of ${MAX_INSTANCES_PER_APP} ${capitalize(app)} instances allowed.`);
      return;
    }
    const nextInstanceId = getNextInstanceId(instances);
    const defaultConfig = buildDefaultInstance(app, nextInstanceId);
    
    setConfig({
      ...config,
      applications: {
        ...config.applications,
        [app]: [...instances, defaultConfig]
      }
    });
  };

  // Remove instance
  const removeInstance = (app: AppType, instanceId: string) => {
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

  if (loadError && !loading) {
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

  if (!config) {
    return null;
  }

  const renderTestButton = (app: AppType, instanceId?: string) => {
    const key = instanceId ? `${app}-${instanceId}` : app;
    const testResult = testResults[key];
    let appConfig: StarrInstanceConfig | undefined;
    if (instanceId && Array.isArray(config.applications[app])) {
      const instances = config.applications[app] as StarrInstanceConfig[];
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

  const fetchQualityProfiles = async (app: AppType, instanceId: string, url: string, apiKey: string) => {
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
      const profiles = await configService.getQualityProfiles(app, url, apiKey);
      setQualityProfiles(prev => ({
        ...prev,
        [key]: profiles
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

  const testConnection = async (app: AppType, instanceId?: string) => {
    if (!config) return;
    const key = instanceId ? `${app}-${instanceId}` : app;
    let appConfig: StarrInstanceConfig | undefined;
    if (instanceId && Array.isArray(config.applications[app])) {
      const instances = config.applications[app] as StarrInstanceConfig[];
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
      const result = await configService.testConnection(
        app,
        appConfig.url,
        appConfig.apiKey
      );
      const success = result.success === true;
      setTestResults(prev => ({
        ...prev,
        [key]: { 
          status: success, 
          testing: false,
          version: result.version,
          appName: result.appName
        }
      }));
      if (success) {
        const versionText = result.version ? ` (v${result.version})` : '';
        toast.success(`Connection test successful${versionText}`);
        // Fetch quality profiles after successful connection test
        if (instanceId && appConfig.url && appConfig.apiKey) {
          fetchQualityProfiles(app, instanceId, appConfig.url, appConfig.apiKey);
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

  return (
    <Box width="100%" pt="0" mt="0">
      <Flex direction="column" gap="3">
        <Tabs.Root value={activeTab} onValueChange={handleTabChange}>
          <Flex align="center" justify="between" gap="3">
            <Tabs.List>
              <Tabs.Trigger value="applications">Applications</Tabs.Trigger>
              <Tabs.Trigger value="logs">Logs</Tabs.Trigger>
              <Tabs.Trigger value="notifications">Notifications</Tabs.Trigger>
              <Tabs.Trigger value="tasks">Tasks</Tabs.Trigger>
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
                  <PlusIcon /> Add {capitalize(selectedAppType)} Instance
                </Button>
              )}
              <Button size="2" onClick={() => saveConfig()} disabled={saveConfigMutation.isPending || loading}>
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
                  <Select.Root value={selectedAppType} onValueChange={(value: string) => setSelectedAppType(value as AppType)}>
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
              <Grid columns={{ initial: '1', md: '2' }} gap="3">
                {(() => {
                  const appInfo = getAppInfo(selectedAppType);
                  return getInstances(selectedAppType).map((instance, index) => {
                    const instanceKey = `${selectedAppType}-${instance.id}`;
                    const isExpanded = expandedInstances.has(instanceKey);

                    return (
                      <InstanceCard
                        key={instance.id}
                        appType={selectedAppType}
                        appInfo={appInfo}
                        instance={instance}
                        index={index}
                        isExpanded={isExpanded}
                        onExpandedChange={(open: boolean) => {
                          const newExpanded = new Set(expandedInstances);
                          if (open) {
                            newExpanded.add(instanceKey);
                          } else {
                            newExpanded.delete(instanceKey);
                          }
                          setExpandedInstances(newExpanded);
                        }}
                        renderTestButton={renderTestButton}
                        updateInstanceConfig={updateInstanceConfig}
                        onRemove={removeInstance}
                        confirmingDeleteId={confirmingDeleteInstance}
                        setConfirmingDeleteId={setConfirmingDeleteInstance}
                        qualityProfiles={qualityProfiles}
                        loadingProfiles={loadingProfiles}
                        confirmingClearTags={confirmingClearTags}
                        setConfirmingClearTags={setConfirmingClearTags}
                        onClearTags={(app, instanceId) => clearTagsMutation.mutate({ app, instanceId })}
                        clearTagsPending={clearTagsMutation.isPending}
                      />
                    );
                  });
                })()}
              </Grid>
            </Flex>
          </Tabs.Content>

          <Tabs.Content value="logs" style={{ paddingTop: '1rem' }}>
            <Suspense fallback={(
              <Flex align="center" justify="center" gap="2" style={{ padding: '1rem' }}>
                <Spinner size="2" />
                <Text size="2" color="gray">Loading logs...</Text>
              </Flex>
            )}>
              {config && (
                <LazySchedulerLogs
                  schedulerStatus={schedulerStatus?.scheduler}
                  schedulerHistory={schedulerHistory}
                  onRefreshHistory={refetchHistory}
                />
              )}
            </Suspense>
          </Tabs.Content>

          <Tabs.Content value="notifications" style={{ paddingTop: '1rem' }}>
            <Card>
              <Flex direction="column" gap="4" p="4">
                <Heading size="5">Notification Configuration</Heading>
                <Separator size="4" />

                <Flex direction="column" gap="1">
                  <Flex align="center" gap="1">
                    <Text size="2" weight="medium">Discord Webhook URL (optional)</Text>
                    <Tooltip content="Webhook URL where Discord notifications will be sent. Leave empty to disable.">
                      <QuestionMarkCircledIcon style={{ cursor: 'help', color: 'var(--gray-9)', width: '14px', height: '14px' }} />
                    </Tooltip>
                  </Flex>
                  <TextField.Root
                    value={config.notifications.discordWebhook}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateNotificationConfig('discordWebhook', e.target.value)}
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
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateNotificationConfig('notifiarrPassthroughWebhook', e.target.value)}
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
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateNotificationConfig('notifiarrPassthroughDiscordChannelId', e.target.value)}
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
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateNotificationConfig('pushoverUserKey', e.target.value)}
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
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateNotificationConfig('pushoverApiToken', e.target.value)}
                  />
                </Flex>
              </Flex>
            </Card>
          </Tabs.Content>

          <Tabs.Content value="tasks">
            <Suspense fallback={(
              <Flex align="center" justify="center" gap="2" style={{ padding: '1rem' }}>
                <Spinner size="2" />
                <Text size="2" color="gray">Loading tasks...</Text>
              </Flex>
            )}>
              {config && (
                <LazyTasksTab
                  config={config}
                  onConfigChange={setConfig}
                  onSaveConfig={saveConfig}
                  schedulerStatus={schedulerStatus}
                  onRefreshStatus={refetchSchedulerStatus}
                />
              )}
            </Suspense>
          </Tabs.Content>

          <Tabs.Content value="advanced" style={{ paddingTop: '1rem' }}>
            <Card>
              <Flex direction="column" gap="4" p="4">
                <Heading size="5">Advanced</Heading>
                <Separator size="4" />

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
      <AlertDialog.Root open={showUnsavedDialog} onOpenChange={(open: boolean) => {
        if (!open) {
          cancelDiscardChanges();
        }
      }}>
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
    </Box>
  );
}

export default Settings;
