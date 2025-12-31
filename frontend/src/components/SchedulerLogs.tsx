import { useRef, useEffect } from 'react';
import {
  Flex,
  Heading,
  Button,
  Card,
  Text,
  Badge,
  Separator,
  Tooltip,
} from '@radix-ui/themes';
import { PlayIcon, TrashIcon, ReloadIcon, QuestionMarkCircledIcon } from '@radix-ui/react-icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { toast } from 'sonner';
import axios from 'axios';
import { formatAppName, getErrorMessage, calculateTimeUntil, formatSchedulerDuration } from '../utils/helpers';
import { LOG_CONTAINER_HEIGHT, LOG_BG_COLOR, LOG_SCROLL_THRESHOLD } from '../utils/constants';
import { AppIcon } from './icons/AppIcon';
import type { SearchResults, SchedulerHistoryEntry } from '../types/api';
import type { Config } from '../types/config';

interface SchedulerLogsProps {
  schedulerStatus?: {
    enabled: boolean;
    globalEnabled: boolean;
    running: boolean;
    schedule: string | null;
    nextRun: string | null;
    instances: Record<string, {
      schedule: string;
      nextRun: string | null;
      running: boolean
    }>;
  };
  schedulerHistory: SchedulerHistoryEntry[];
  config?: Config;
  onRefreshHistory: () => void;
}

export function SchedulerLogs({ schedulerStatus, schedulerHistory, config, onRefreshHistory }: SchedulerLogsProps) {
  const queryClient = useQueryClient();
  const logContainerRef = useRef<HTMLDivElement>(null);

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
      queryClient.invalidateQueries({ queryKey: ['stats'] });
      onRefreshHistory();
    },
    onError: (error: unknown) => {
      toast.error('Search failed: ' + getErrorMessage(error));
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
      onRefreshHistory();
    },
  });

  // Convert scheduler history to log format
  const convertHistoryToLogs = (
    history: SchedulerHistoryEntry[],
    nextRun: string | null,
    schedulerEnabled: boolean,
    instanceSchedules?: Record<string, { schedule: string; nextRun: string | null; running: boolean }>
  ): Array<{ timestamp: string; app: string; message: string; type: 'success' | 'error' | 'info' }> => {
    const logs: Array<{ timestamp: string; app: string; message: string; type: 'success' | 'error' | 'info' }> = [];

    // Add global scheduler next run time if global scheduler is enabled
    if (schedulerEnabled && nextRun) {
      const timeUntilNext = calculateTimeUntil(nextRun);
      const timeString = formatSchedulerDuration(timeUntilNext);

      logs.push({
        timestamp: format(new Date(), 'HH:mm:ss'),
        app: 'Scheduler',
        message: `Next run (Global): ${format(new Date(nextRun), 'PPpp')} (in ${timeString})`,
        type: 'info'
      });
    }

    // Add per-instance next run times
    if (instanceSchedules && Object.keys(instanceSchedules).length > 0) {
      Object.entries(instanceSchedules).forEach(([instanceKey, instanceStatus]) => {
        if (instanceStatus.nextRun) {
          const timeUntilNext = calculateTimeUntil(instanceStatus.nextRun);
          const timeString = formatSchedulerDuration(timeUntilNext);

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
            timestamp: format(new Date(), 'HH:mm:ss'),
            app: instanceKey,
            message: `Next run (${instanceName}): ${format(new Date(instanceStatus.nextRun), 'PPpp')} (in ${timeString})`,
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

            // Show searched action
            logs.push({
              timestamp,
              app,
              message: `${appName}: Searched ${searched} ${mediaType}`,
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

  const scheduler = schedulerStatus || null;
  const logs = convertHistoryToLogs(
    schedulerHistory,
    scheduler?.nextRun || null,
    scheduler?.globalEnabled || false,
    scheduler?.instances
  );

  return (
    <Card>
      <Flex direction="column" gap="3">
        <Flex align="center" justify="between">
          <Flex align="center" gap="2">
            <Heading size="5">Scheduler Logs</Heading>
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
            <Tooltip content="Refresh the page to update scheduler status and logs.">
              <QuestionMarkCircledIcon style={{ color: 'var(--gray-9)', cursor: 'help' }} />
            </Tooltip>
          </Flex>
          <Flex gap="3">
            <Tooltip content="Refresh the page to update scheduler status and logs.">
              <Button
                size="2"
                variant="outline"
                onClick={() => window.location.reload()}
              >
                <ReloadIcon /> Refresh
              </Button>
            </Tooltip>
            <Tooltip content="Start a search run immediately using the current configuration.">
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
          </Flex>
        </Flex>
        <Separator size="4" />
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
                No scheduler runs yet. The scheduler will automatically run searches based on the schedule.
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
      </Flex>
    </Card>
  );
}
