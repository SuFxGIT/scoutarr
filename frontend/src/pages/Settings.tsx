import { useState, useEffect } from 'react';
import {
  Flex,
  Container,
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
  Spinner
} from '@radix-ui/themes';
import { CheckIcon, CrossCircledIcon } from '@radix-ui/react-icons';
import axios from 'axios';
import type { Config } from '../types/config';

function Settings() {
  const [config, setConfig] = useState<Config | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testResults, setTestResults] = useState<Record<string, { status: boolean | null; testing: boolean }>>({});
  const [saveMessage, setSaveMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [schedulerPreset, setSchedulerPreset] = useState<string>('custom');

  const cronPresets: Record<string, string> = {
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
      setConfig(response.data);
      if (response.data.scheduler?.schedule) {
        setSchedulerPreset(getPresetFromSchedule(response.data.scheduler.schedule));
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

  const testConnection = async (app: string) => {
    if (!config) return;
    
    const appConfig = config.applications[app as keyof Config['applications']];
    if (!appConfig || !appConfig.url || !appConfig.apiKey) {
      setTestResults(prev => ({
        ...prev,
        [app]: { status: false, testing: false }
      }));
      return;
    }

    // Set testing state
    setTestResults(prev => ({
      ...prev,
      [app]: { status: null, testing: true }
    }));

    try {
      // Send current local config values to test endpoint
      const response = await axios.post(`/api/config/test/${app}`, {
        url: appConfig.url,
        apiKey: appConfig.apiKey
      });
      setTestResults(prev => ({
        ...prev,
        [app]: { status: response.data.success === true, testing: false }
      }));
    } catch (error: any) {
      setTestResults(prev => ({
        ...prev,
        [app]: { status: false, testing: false }
      }));
    }
  };

  const updateAppConfig = (app: keyof Config['applications'], field: string, value: any) => {
    if (!config) return;
    setConfig({
      ...config,
      applications: {
        ...config.applications,
        [app]: {
          ...config.applications[app],
          [field]: value
        }
      }
    });
    // Clear test result when config changes
    if (field === 'url' || field === 'apiKey' || field === 'enabled') {
      setTestResults(prev => ({
        ...prev,
        [app]: { status: null, testing: false }
      }));
    }
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
      <Container size="3" style={{ padding: '2rem' }}>
        <Flex align="center" justify="center" gap="3">
          <Spinner size="3" />
          <Text>Loading configuration...</Text>
        </Flex>
      </Container>
    );
  }

  if (!config) {
    return (
      <Container size="3" style={{ padding: '2rem' }}>
        <Callout.Root color="red">
          <Callout.Text>Failed to load configuration</Callout.Text>
          <Callout.Text size="1" style={{ marginTop: '0.5rem' }}>
            <Button size="2" variant="soft" onClick={loadConfig}>
              Retry
            </Button>
          </Callout.Text>
        </Callout.Root>
      </Container>
    );
  }

  const renderTestButton = (app: string) => {
    const testResult = testResults[app];
    const appConfig = config.applications[app as keyof Config['applications']];
    const canTest = appConfig?.url && appConfig?.apiKey;

    return (
      <Flex gap="3" align="center">
        <Button
          variant="outline"
          onClick={() => testConnection(app)}
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

        <Tabs.Root defaultValue="radarr">
          <Tabs.List>
            <Tabs.Trigger value="radarr">Radarr</Tabs.Trigger>
            <Tabs.Trigger value="sonarr">Sonarr</Tabs.Trigger>
            <Tabs.Trigger value="notifications">Notifications</Tabs.Trigger>
            <Tabs.Trigger value="scheduler">Scheduler</Tabs.Trigger>
          </Tabs.List>

          <Tabs.Content value="radarr" style={{ paddingTop: '1rem' }}>
            <Card>
              <Flex direction="column" gap="4" p="4">
                <Heading size="5">Radarr Configuration</Heading>
                <Separator />

                <Flex direction="column" gap="1">
                  <TextField.Root
                    placeholder="http://localhost:7878"
                    value={config.applications.radarr.url}
                    onChange={(e) => updateAppConfig('radarr', 'url', e.target.value)}
                    label="Radarr URL"
                  />
                  <Text size="1" color="gray">
                    The base URL where your Radarr instance is accessible (e.g., http://localhost:7878 or https://radarr.example.com)
                  </Text>
                </Flex>

                <Flex direction="column" gap="1">
                  <TextField.Root
                    type="password"
                    placeholder="API Key"
                    value={config.applications.radarr.apiKey}
                    onChange={(e) => updateAppConfig('radarr', 'apiKey', e.target.value)}
                    label="API Key"
                  />
                  <Text size="1" color="gray">
                    Your Radarr API key found in Settings → General → Security → API Key (must be 32 characters)
                  </Text>
                </Flex>

                {renderTestButton('radarr')}

                <Flex direction="column" gap="1">
                  <TextField.Root
                    type="number"
                    value={config.applications.radarr.count.toString()}
                    onChange={(e) => updateAppConfig('radarr', 'count', parseInt(e.target.value) || 10)}
                    label="Number of Movies to Search"
                  />
                  <Text size="1" color="gray">
                    How many movies to randomly select and search for upgrades each time the script runs. Use "max" to search all matching movies.
                  </Text>
                </Flex>

                <Flex direction="column" gap="1">
                  <TextField.Root
                    value={config.applications.radarr.tagName}
                    onChange={(e) => updateAppConfig('radarr', 'tagName', e.target.value)}
                    label="Tag Name"
                  />
                  <Text size="1" color="gray">
                    The tag name to use for tracking which movies have been searched. This tag will be created automatically if it doesn't exist.
                  </Text>
                </Flex>

                <Flex direction="column" gap="1">
                  <TextField.Root
                    value={config.applications.radarr.ignoreTag}
                    onChange={(e) => updateAppConfig('radarr', 'ignoreTag', e.target.value)}
                    label="Ignore Tag (optional)"
                  />
                  <Text size="1" color="gray">
                    Movies with this tag will be excluded from upgrade searches. Leave empty to include all movies matching other criteria.
                  </Text>
                </Flex>

                <Flex direction="column" gap="1">
                  <Switch
                    checked={config.applications.radarr.monitored}
                    onCheckedChange={(checked) => updateAppConfig('radarr', 'monitored', checked)}
                  />
                  <Text size="2" color="gray">
                    Search Monitored Movies Only - When enabled, only movies that are currently monitored will be considered for upgrades.
                  </Text>
                </Flex>

                <Flex direction="column" gap="1">
                  <Select.Root
                    value={config.applications.radarr.movieStatus}
                    onValueChange={(value) => updateAppConfig('radarr', 'movieStatus', value)}
                  >
                    <Select.Trigger label="Minimum Movie Status" />
                    <Select.Content>
                      <Select.Item value="announced">Announced</Select.Item>
                      <Select.Item value="in cinemas">In Cinemas</Select.Item>
                      <Select.Item value="released">Released</Select.Item>
                    </Select.Content>
                  </Select.Root>
                  <Text size="1" color="gray">
                    Only movies with this status or higher will be considered for upgrades. Released is recommended for most use cases.
                  </Text>
                </Flex>

                <Flex direction="column" gap="1">
                  <TextField.Root
                    value={config.applications.radarr.qualityProfileName}
                    onChange={(e) => updateAppConfig('radarr', 'qualityProfileName', e.target.value)}
                    label="Quality Profile Name (optional)"
                  />
                  <Text size="1" color="gray">
                    Only movies using this specific quality profile will be considered. Leave empty to include all quality profiles.
                  </Text>
                </Flex>

                <Flex direction="column" gap="1">
                  <Switch
                    checked={config.applications.radarr.unattended}
                    onCheckedChange={(checked) => updateAppConfig('radarr', 'unattended', checked)}
                  />
                  <Text size="2" color="gray">
                    Unattended Mode - When enabled, the script will automatically remove tags from all media and re-filter when no media is found, allowing continuous operation.
                  </Text>
                </Flex>
              </Flex>
            </Card>
          </Tabs.Content>

          <Tabs.Content value="sonarr" style={{ paddingTop: '1rem' }}>
            <Card>
              <Flex direction="column" gap="4" p="4">
                <Heading size="5">Sonarr Configuration</Heading>
                <Separator />

                <Flex direction="column" gap="1">
                  <TextField.Root
                    placeholder="http://localhost:8989"
                    value={config.applications.sonarr.url}
                    onChange={(e) => updateAppConfig('sonarr', 'url', e.target.value)}
                    label="Sonarr URL"
                  />
                  <Text size="1" color="gray">
                    The base URL where your Sonarr instance is accessible (e.g., http://localhost:8989 or https://sonarr.example.com)
                  </Text>
                </Flex>

                <Flex direction="column" gap="1">
                  <TextField.Root
                    type="password"
                    placeholder="API Key"
                    value={config.applications.sonarr.apiKey}
                    onChange={(e) => updateAppConfig('sonarr', 'apiKey', e.target.value)}
                    label="API Key"
                  />
                  <Text size="1" color="gray">
                    Your Sonarr API key found in Settings → General → Security → API Key (must be 32 characters)
                  </Text>
                </Flex>

                {renderTestButton('sonarr')}

                <Flex direction="column" gap="1">
                  <TextField.Root
                    type="number"
                    value={config.applications.sonarr.count.toString()}
                    onChange={(e) => updateAppConfig('sonarr', 'count', parseInt(e.target.value) || 5)}
                    label="Number of Series to Search"
                  />
                  <Text size="1" color="gray">
                    How many series to randomly select and search for upgrades each time the script runs. Use "max" to search all matching series.
                  </Text>
                </Flex>

                <Flex direction="column" gap="1">
                  <TextField.Root
                    value={config.applications.sonarr.tagName}
                    onChange={(e) => updateAppConfig('sonarr', 'tagName', e.target.value)}
                    label="Tag Name"
                  />
                  <Text size="1" color="gray">
                    The tag name to use for tracking which series have been searched. This tag will be created automatically if it doesn't exist.
                  </Text>
                </Flex>

                <Flex direction="column" gap="1">
                  <TextField.Root
                    value={config.applications.sonarr.ignoreTag}
                    onChange={(e) => updateAppConfig('sonarr', 'ignoreTag', e.target.value)}
                    label="Ignore Tag (optional)"
                  />
                  <Text size="1" color="gray">
                    Series with this tag will be excluded from upgrade searches. Leave empty to include all series matching other criteria.
                  </Text>
                </Flex>

                <Flex direction="column" gap="1">
                  <Switch
                    checked={config.applications.sonarr.monitored}
                    onCheckedChange={(checked) => updateAppConfig('sonarr', 'monitored', checked)}
                  />
                  <Text size="2" color="gray">
                    Search Monitored Series Only - When enabled, only series that are currently monitored will be considered for upgrades.
                  </Text>
                </Flex>

                <Flex direction="column" gap="1">
                  <Select.Root
                    value={config.applications.sonarr.seriesStatus || 'any'}
                    onValueChange={(value) => updateAppConfig('sonarr', 'seriesStatus', value === 'any' ? '' : value)}
                  >
                    <Select.Trigger label="Series Status (optional)" />
                    <Select.Content>
                      <Select.Item value="any">Any</Select.Item>
                      <Select.Item value="continuing">Continuing</Select.Item>
                      <Select.Item value="upcoming">Upcoming</Select.Item>
                      <Select.Item value="ended">Ended</Select.Item>
                    </Select.Content>
                  </Select.Root>
                  <Text size="1" color="gray">
                    Only series with this status will be considered for upgrades. Leave as "Any" to include all statuses.
                  </Text>
                </Flex>

                <Flex direction="column" gap="1">
                  <TextField.Root
                    value={config.applications.sonarr.qualityProfileName}
                    onChange={(e) => updateAppConfig('sonarr', 'qualityProfileName', e.target.value)}
                    label="Quality Profile Name (optional)"
                  />
                  <Text size="1" color="gray">
                    Only series using this specific quality profile will be considered. Leave empty to include all quality profiles.
                  </Text>
                </Flex>

                <Flex direction="column" gap="1">
                  <Switch
                    checked={config.applications.sonarr.unattended}
                    onCheckedChange={(checked) => updateAppConfig('sonarr', 'unattended', checked)}
                  />
                  <Text size="2" color="gray">
                    Unattended Mode - When enabled, the script will automatically remove tags from all media and re-filter when no media is found, allowing continuous operation.
                  </Text>
                </Flex>
              </Flex>
            </Card>
          </Tabs.Content>

          <Tabs.Content value="notifications" style={{ paddingTop: '1rem' }}>
            <Card>
              <Flex direction="column" gap="4" p="4">
                <Heading size="5">Notification Configuration</Heading>
                <Separator />

                <Flex direction="column" gap="1">
                  <TextField.Root
                    value={config.notifications.discordWebhook}
                    onChange={(e) => updateNotificationConfig('discordWebhook', e.target.value)}
                    label="Discord Webhook URL (optional)"
                    placeholder="https://discord.com/api/webhooks/..."
                  />
                  <Text size="1" color="gray">
                    Discord webhook URL to receive notifications when upgrades are performed. Leave empty to disable Discord notifications.
                  </Text>
                </Flex>

                <Flex direction="column" gap="1">
                  <TextField.Root
                    value={config.notifications.notifiarrPassthroughWebhook}
                    onChange={(e) => updateNotificationConfig('notifiarrPassthroughWebhook', e.target.value)}
                    label="Notifiarr Passthrough Webhook (optional)"
                  />
                  <Text size="1" color="gray">
                    Notifiarr passthrough webhook URL for notifications. Leave empty to disable Notifiarr notifications.
                  </Text>
                </Flex>

                <Flex direction="column" gap="1">
                  <TextField.Root
                    value={config.notifications.notifiarrPassthroughDiscordChannelId}
                    onChange={(e) => updateNotificationConfig('notifiarrPassthroughDiscordChannelId', e.target.value)}
                    label="Notifiarr Discord Channel ID (optional)"
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

                <Flex direction="column" gap="1">
                  <Switch
                    checked={config.scheduler?.enabled || false}
                    onCheckedChange={(checked) => {
                      if (!config.scheduler) {
                        setConfig({
                          ...config,
                          scheduler: { enabled: checked, schedule: '0 */6 * * *' }
                        });
                      } else {
                        setConfig({
                          ...config,
                          scheduler: { ...config.scheduler, enabled: checked }
                        });
                      }
                    }}
                  />
                  <Text size="2" color="gray">
                    Enable Scheduler - When enabled, searches will run automatically according to the schedule below.
                  </Text>
                </Flex>

                <Flex direction="column" gap="1">
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
                          scheduler: { enabled: false, schedule }
                        });
                      } else {
                        setConfig({
                          ...config,
                          scheduler: { ...config.scheduler, schedule }
                        });
                      }
                    }}
                  >
                    <Select.Trigger label="Schedule" />
                    <Select.Content position="popper" sideOffset={5}>
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

        <Flex justify="end" mt="4">
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
      </Flex>
    </div>
  );
}

export default Settings;
