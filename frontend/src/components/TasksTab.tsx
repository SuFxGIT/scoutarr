import { useState, useEffect } from 'react';
import {
  Flex,
  Heading,
  Card,
  Text,
  Switch,
  Badge,
  Tooltip,
  Link,
  Table
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
    <Table.Row>
      <Table.Cell>
        <Flex align="center" gap="2">
          <Text size="2" weight="medium">{name}</Text>
          <Tooltip content={description}>
            <QuestionMarkCircledIcon style={{ cursor: 'help', color: 'var(--gray-9)', width: '14px', height: '14px' }} />
          </Tooltip>
        </Flex>
      </Table.Cell>
      <Table.Cell>
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
      </Table.Cell>
      <Table.Cell>
        <Flex align="center" gap="2" justify="end">
          <Switch
            checked={enabled}
            onCheckedChange={onToggle}
            size="1"
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
      </Table.Cell>
    </Table.Row>
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
      <Card>
        <Flex direction="column" gap="3" p="4">
          <Heading size="5">Scheduled Tasks</Heading>

          <Table.Root variant="surface">
            <Table.Header>
              <Table.Row>
                <Table.ColumnHeaderCell>Task</Table.ColumnHeaderCell>
                <Table.ColumnHeaderCell>Schedule</Table.ColumnHeaderCell>
                <Table.ColumnHeaderCell style={{ textAlign: 'right' }}>Next Run</Table.ColumnHeaderCell>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {/* Global Scheduler */}
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

              {/* Radarr Instances */}
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

              {/* Sonarr Instances */}
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

              {/* Lidarr Instances */}
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

              {/* Readarr Instances */}
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

              {/* Media Library Sync */}
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
            </Table.Body>
          </Table.Root>
        </Flex>
      </Card>
    </Flex>
  );
}
