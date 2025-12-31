import { useState, useEffect } from 'react';
import {
  Flex,
  Heading,
  Card,
  Text,
  Switch,
  Separator,
  Badge,
  Tooltip,
  Link
} from '@radix-ui/themes';
import { QuestionMarkCircledIcon } from '@radix-ui/react-icons';
import type { Config } from '../types/config';
import type { SchedulerStatus, SyncSchedulerStatus } from '../types/api';
import { calculateTimeUntil, formatCountdown } from '../utils/helpers';

interface TasksTabProps {
  config: Config;
  onConfigChange: (config: Config) => void;
  schedulerStatus?: {
    scheduler?: SchedulerStatus;
    sync?: SyncSchedulerStatus;
  };
}

interface TaskRowProps {
  name: string;
  description: string;
  cronExpression: string;
  enabled: boolean;
  nextRun: string | null;
  onToggle: (enabled: boolean) => void;
  countdown: number;
}

function TaskRow({ name, description, cronExpression, enabled, nextRun, onToggle, countdown }: TaskRowProps) {
  return (
    <Flex direction="column" gap="3" style={{
      padding: '12px 16px',
      borderRadius: '8px',
      background: 'var(--gray-2)',
      border: '1px solid var(--gray-4)'
    }}>
      <Flex direction="column" gap="1">
        <Text size="3" weight="medium">{name}</Text>
        <Text size="1" color="gray">{description}</Text>
      </Flex>

      <Flex direction="row" align="center" justify="between" wrap="wrap" gap="3">
        <Flex align="center" gap="2">
          <Text size="2" color="gray">Cron:</Text>
          <Tooltip content="Click to understand this cron expression">
            <Link
              href={`https://crontab.guru/#${cronExpression.replace(/ /g, '_')}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <code style={{
                fontSize: '12px',
                padding: '2px 6px',
                background: 'var(--gray-4)',
                borderRadius: '4px',
                fontFamily: 'monospace'
              }}>
                {cronExpression}
              </code>
            </Link>
          </Tooltip>
        </Flex>

        <Flex align="center" gap="3">
          <Switch
            checked={enabled}
            onCheckedChange={onToggle}
          />
          <Badge color={enabled ? 'green' : 'gray'} size="1">
            {enabled ? 'Enabled' : 'Disabled'}
          </Badge>
          {enabled && nextRun && (
            <Text size="2" weight="medium" style={{ minWidth: '100px', textAlign: 'right' }}>
              {countdown === 0 ? 'Now' : `in ${formatCountdown(countdown)}`}
            </Text>
          )}
          {enabled && !nextRun && (
            <Text size="2" color="gray" style={{ minWidth: '100px', textAlign: 'right' }}>
              Calculating...
            </Text>
          )}
          {!enabled && (
            <Text size="2" color="gray" style={{ minWidth: '100px', textAlign: 'right' }}>
              —
            </Text>
          )}
        </Flex>
      </Flex>
    </Flex>
  );
}

export function TasksTab({ config, onConfigChange, schedulerStatus }: TasksTabProps) {
  const [countdowns, setCountdowns] = useState<Record<string, number>>({});

  // Update countdowns every second
  useEffect(() => {
    const updateCountdowns = () => {
      const newCountdowns: Record<string, number> = {};

      // Global scheduler
      if (schedulerStatus?.scheduler?.nextRun) {
        newCountdowns['global-scheduler'] = calculateTimeUntil(schedulerStatus.scheduler.nextRun);
      }

      // Per-instance schedulers
      if (schedulerStatus?.scheduler?.instances) {
        Object.entries(schedulerStatus.scheduler.instances).forEach(([instanceId, instance]) => {
          if (instance.nextRun) {
            newCountdowns[`instance-${instanceId}`] = calculateTimeUntil(instance.nextRun);
          }
        });
      }

      // Sync scheduler
      if (schedulerStatus?.sync?.nextRun) {
        newCountdowns['sync-scheduler'] = calculateTimeUntil(schedulerStatus.sync.nextRun);
      }

      setCountdowns(newCountdowns);
    };

    // Initial update
    updateCountdowns();

    // Update every second
    const interval = setInterval(updateCountdowns, 1000);

    return () => clearInterval(interval);
  }, [schedulerStatus]);

  return (
    <Flex direction="column" gap="4" style={{ paddingTop: '1rem' }}>
      {/* Global Scheduler */}
      <Card>
        <Flex direction="column" gap="4" p="4">
          <Flex align="center" gap="2">
            <Heading size="5">Global Scheduler</Heading>
            <Tooltip content="Runs upgrade searches across all configured applications">
              <QuestionMarkCircledIcon style={{ cursor: 'help', color: 'var(--gray-9)', width: '16px', height: '16px' }} />
            </Tooltip>
          </Flex>
          <Separator size="4" />

          <TaskRow
            name="Global Upgrade Search"
            description="Searches for upgrades across all configured applications"
            cronExpression={config.scheduler?.schedule || '0 */6 * * *'}
            enabled={config.scheduler?.enabled || false}
            nextRun={schedulerStatus?.scheduler?.nextRun || null}
            onToggle={(enabled) => {
              if (!config.scheduler) {
                onConfigChange({
                  ...config,
                  scheduler: { enabled, schedule: '0 */6 * * *', unattended: false }
                });
              } else {
                onConfigChange({
                  ...config,
                  scheduler: { ...config.scheduler, enabled }
                });
              }
            }}
            countdown={countdowns['global-scheduler'] || 0}
          />
        </Flex>
      </Card>

      {/* Per-Instance Schedulers */}
      <Card>
        <Flex direction="column" gap="4" p="4">
          <Flex align="center" gap="2">
            <Heading size="5">Per-Instance Schedulers</Heading>
            <Tooltip content="Individual schedules for each instance (overrides global schedule)">
              <QuestionMarkCircledIcon style={{ cursor: 'help', color: 'var(--gray-9)', width: '16px', height: '16px' }} />
            </Tooltip>
          </Flex>
          <Separator size="4" />

          {/* Radarr Instances */}
          {config.applications.radarr.length > 0 && (
            <Flex direction="column" gap="3">
              <Text size="3" weight="bold">Radarr</Text>
              {config.applications.radarr.map((instance) => (
                instance.schedule && (
                  <TaskRow
                    key={instance.id}
                    name={`${instance.name || instance.id} - Upgrade Search`}
                    description={`Searches for movie upgrades in ${instance.name || instance.id}`}
                    cronExpression={instance.schedule}
                    enabled={instance.scheduleEnabled || false}
                    nextRun={schedulerStatus?.scheduler?.instances?.[instance.id]?.nextRun || null}
                    onToggle={(enabled) => {
                      onConfigChange({
                        ...config,
                        applications: {
                          ...config.applications,
                          radarr: config.applications.radarr.map((inst) =>
                            inst.id === instance.id ? { ...inst, scheduleEnabled: enabled } : inst
                          )
                        }
                      });
                    }}
                    countdown={countdowns[`instance-${instance.id}`] || 0}
                  />
                )
              ))}
            </Flex>
          )}

          {/* Sonarr Instances */}
          {config.applications.sonarr.length > 0 && (
            <Flex direction="column" gap="3">
              <Text size="3" weight="bold">Sonarr</Text>
              {config.applications.sonarr.map((instance) => (
                instance.schedule && (
                  <TaskRow
                    key={instance.id}
                    name={`${instance.name || instance.id} - Upgrade Search`}
                    description={`Searches for series upgrades in ${instance.name || instance.id}`}
                    cronExpression={instance.schedule}
                    enabled={instance.scheduleEnabled || false}
                    nextRun={schedulerStatus?.scheduler?.instances?.[instance.id]?.nextRun || null}
                    onToggle={(enabled) => {
                      onConfigChange({
                        ...config,
                        applications: {
                          ...config.applications,
                          sonarr: config.applications.sonarr.map((inst) =>
                            inst.id === instance.id ? { ...inst, scheduleEnabled: enabled } : inst
                          )
                        }
                      });
                    }}
                    countdown={countdowns[`instance-${instance.id}`] || 0}
                  />
                )
              ))}
            </Flex>
          )}

          {/* Lidarr Instances */}
          {config.applications.lidarr.length > 0 && (
            <Flex direction="column" gap="3">
              <Text size="3" weight="bold">Lidarr</Text>
              {config.applications.lidarr.map((instance) => (
                instance.schedule && (
                  <TaskRow
                    key={instance.id}
                    name={`${instance.name || instance.id} - Upgrade Search`}
                    description={`Searches for artist upgrades in ${instance.name || instance.id}`}
                    cronExpression={instance.schedule}
                    enabled={instance.scheduleEnabled || false}
                    nextRun={schedulerStatus?.scheduler?.instances?.[instance.id]?.nextRun || null}
                    onToggle={(enabled) => {
                      onConfigChange({
                        ...config,
                        applications: {
                          ...config.applications,
                          lidarr: config.applications.lidarr.map((inst) =>
                            inst.id === instance.id ? { ...inst, scheduleEnabled: enabled } : inst
                          )
                        }
                      });
                    }}
                    countdown={countdowns[`instance-${instance.id}`] || 0}
                  />
                )
              ))}
            </Flex>
          )}

          {/* Readarr Instances */}
          {config.applications.readarr.length > 0 && (
            <Flex direction="column" gap="3">
              <Text size="3" weight="bold">Readarr</Text>
              {config.applications.readarr.map((instance) => (
                instance.schedule && (
                  <TaskRow
                    key={instance.id}
                    name={`${instance.name || instance.id} - Upgrade Search`}
                    description={`Searches for author upgrades in ${instance.name || instance.id}`}
                    cronExpression={instance.schedule}
                    enabled={instance.scheduleEnabled || false}
                    nextRun={schedulerStatus?.scheduler?.instances?.[instance.id]?.nextRun || null}
                    onToggle={(enabled) => {
                      onConfigChange({
                        ...config,
                        applications: {
                          ...config.applications,
                          readarr: config.applications.readarr.map((inst) =>
                            inst.id === instance.id ? { ...inst, scheduleEnabled: enabled } : inst
                          )
                        }
                      });
                    }}
                    countdown={countdowns[`instance-${instance.id}`] || 0}
                  />
                )
              ))}
            </Flex>
          )}

          {/* No instances message */}
          {!config.applications.radarr.some(i => i.schedule) &&
           !config.applications.sonarr.some(i => i.schedule) &&
           !config.applications.lidarr.some(i => i.schedule) &&
           !config.applications.readarr.some(i => i.schedule) && (
            <Text size="2" color="gray" style={{ fontStyle: 'italic' }}>
              No per-instance schedules configured. Configure schedules in the Applications tab.
            </Text>
          )}
        </Flex>
      </Card>

      {/* Sync Scheduler */}
      <Card>
        <Flex direction="column" gap="4" p="4">
          <Flex align="center" gap="2">
            <Heading size="5">Media Library Sync</Heading>
            <Tooltip content="Syncs media library data from *arr applications to local database">
              <QuestionMarkCircledIcon style={{ cursor: 'help', color: 'var(--gray-9)', width: '16px', height: '16px' }} />
            </Tooltip>
          </Flex>
          <Separator size="4" />

          <TaskRow
            name="Media Library Sync"
            description="Syncs all media from configured *arr instances to the local database"
            cronExpression={config.tasks.syncSchedule}
            enabled={config.tasks.syncEnabled}
            nextRun={schedulerStatus?.sync?.nextRun || null}
            onToggle={(enabled) => {
              onConfigChange({
                ...config,
                tasks: { ...config.tasks, syncEnabled: enabled }
              });
            }}
            countdown={countdowns['sync-scheduler'] || 0}
          />
        </Flex>
      </Card>
    </Flex>
  );
}
