import { useState, useEffect } from 'react';
import {
  Flex,
  Heading,
  Card,
  Text,
  Switch,
  Tooltip,
  Table,
  Popover,
  Button,
  TextField,
  IconButton,
  Callout
} from '@radix-ui/themes';
import { QuestionMarkCircledIcon, PlayIcon, InfoCircledIcon } from '@radix-ui/react-icons';
import { CronExpressionParser } from 'cron-parser';
import type { Config } from '../types/config';
import type { SchedulerStatus, SyncSchedulerStatus } from '../types/api';
import { calculateTimeUntil, formatCountdown } from '../utils/helpers';
import { showSuccessToast } from '../utils/toast';
import { schedulerService } from '../services/schedulerService';

interface TasksTabProps {
  config: Config;
  onConfigChange: (config: Config) => void;
  onSaveConfig: (config: Config) => void;
  schedulerStatus?: {
    scheduler?: SchedulerStatus;
    sync?: SyncSchedulerStatus;
  };
  onRefreshStatus?: () => void;
}

interface TaskRowProps {
  name: string;
  description: string;
  cronExpression: string;
  enabled: boolean;
  nextRun: string | null;
  onToggle: (enabled: boolean) => void;
  onEditSchedule: (newSchedule: string) => Config;
  onSaveConfig: (config: Config) => void;
  countdown: number;
  onManualRun: () => void;
  onRefreshStatus?: () => void;
}

function TaskRow({ name, description, cronExpression, enabled, nextRun, onToggle, onEditSchedule, onSaveConfig, countdown, onManualRun, onRefreshStatus }: TaskRowProps) {
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  const [editedSchedule, setEditedSchedule] = useState(cronExpression);
  const [error, setError] = useState<string>('');

  // Update local state when cronExpression changes
  useEffect(() => {
    setEditedSchedule(cronExpression);
    setError('');
  }, [cronExpression]);

  // Cron validation using cron-parser
  const validateCron = (cron: string): string => {
    const trimmed = cron.trim();
    if (!trimmed) return 'Cron expression is required';

    try {
      CronExpressionParser.parse(trimmed);
      return '';
    } catch (err) {
      return err instanceof Error ? err.message : 'Invalid cron expression';
    }
  };

  const handleSave = () => {
    const validationError = validateCron(editedSchedule);
    if (validationError) {
      setError(validationError);
      return;
    }

    const updatedConfig = onEditSchedule(editedSchedule);
    setIsPopoverOpen(false);
    setError('');
    onSaveConfig(updatedConfig);
    
    // Refresh scheduler status to update next run time immediately
    if (onRefreshStatus) {
      setTimeout(() => onRefreshStatus(), 100);
    }
  };

  return (
    <Table.Row>
      <Table.Cell style={{ textAlign: 'left' }}>
        <Flex align="center" gap="2">
          <Switch
            checked={enabled}
            onCheckedChange={onToggle}
            size="1"
          />
          <Flex direction="column" gap="1">
            <Flex align="center" gap="1">
              <Text size="2" weight="medium">{name}</Text>
              <Tooltip content={description}>
                <QuestionMarkCircledIcon style={{ cursor: 'help', color: 'var(--gray-9)', width: '12px', height: '12px' }} />
              </Tooltip>
            </Flex>
          </Flex>
        </Flex>
      </Table.Cell>
      <Table.Cell style={{ textAlign: 'center' }}>
        <Popover.Root open={isPopoverOpen} onOpenChange={setIsPopoverOpen}>
          <Tooltip content="Click to edit schedule">
            <Popover.Trigger>
              <Button variant="ghost" style={{ padding: '0', height: 'auto', cursor: 'pointer' }}>
                <code style={{
                  fontSize: '12px',
                  padding: '2px 6px',
                  background: 'var(--gray-4)',
                  borderRadius: '4px',
                  fontFamily: 'monospace',
                  cursor: 'pointer'
                }}>
                  {cronExpression}
                </code>
              </Button>
            </Popover.Trigger>
          </Tooltip>
          <Popover.Content size="2" style={{ padding: '8px' }}>
            <Flex direction="column" gap="2">
              <Flex gap="2" align="center">
                <TextField.Root
                  value={editedSchedule}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEditedSchedule(e.target.value)}
                  placeholder="0 */6 * * *"
                  size="2"
                  style={{ minWidth: '150px' }}
                />
                <Button variant="solid" size="2" onClick={handleSave}>
                  Save
                </Button>
              </Flex>
              {error && (
                <Text size="1" color="red">
                  {error}
                </Text>
              )}
            </Flex>
          </Popover.Content>
        </Popover.Root>
      </Table.Cell>
      <Table.Cell style={{ textAlign: 'right' }}>
        {enabled && nextRun && (
          <Text size="2" weight="medium" style={{ display: 'inline-block', minWidth: '100px' }}>
            {countdown === 0 ? 'Now' : `in ${formatCountdown(countdown)}`}
          </Text>
        )}
        {enabled && !nextRun && (
          <Text size="2" color="gray" style={{ display: 'inline-block', minWidth: '100px' }}>
            Calculating...
          </Text>
        )}
        {!enabled && (
          <Text size="2" color="gray" style={{ display: 'inline-block', minWidth: '100px' }}>
            —
          </Text>
        )}
      </Table.Cell>
      <Table.Cell style={{ textAlign: 'center' }}>
        <Tooltip content="Run now">
          <IconButton
            variant="soft"
            size="1"
            onClick={onManualRun}
            style={{ cursor: 'pointer' }}
          >
            <PlayIcon />
          </IconButton>
        </Tooltip>
      </Table.Cell>
    </Table.Row>
  );
}

export function TasksTab({ config, onConfigChange, onSaveConfig, schedulerStatus, onRefreshStatus }: TasksTabProps) {
  const [countdowns, setCountdowns] = useState<Record<string, number>>({});

  // Update countdowns every second
  useEffect(() => {
    const updateCountdowns = () => {
      const newCountdowns: Record<string, number> = {};

      // Scheduler
      if (schedulerStatus?.scheduler?.nextRun) {
        newCountdowns['scheduler'] = calculateTimeUntil(schedulerStatus.scheduler.nextRun);
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

          <Callout.Root size="1" variant="surface" color="blue">
            <Callout.Icon>
              <InfoCircledIcon />
            </Callout.Icon>
            <Callout.Text>
              Need help with cron expressions? Visit{' '}
              <a 
                href="https://crontab.guru" 
                target="_blank" 
                rel="noopener noreferrer"
                style={{ color: 'var(--accent-11)', textDecoration: 'underline' }}
              >
                crontab.guru
              </a>
              {' '}for an interactive guide.
            </Callout.Text>
          </Callout.Root>

          <Table.Root variant="surface">
            <Table.Header>
              <Table.Row>
                <Table.ColumnHeaderCell style={{ textAlign: 'left', width: '40%' }}>Task</Table.ColumnHeaderCell>
                <Table.ColumnHeaderCell style={{ textAlign: 'center', width: '30%' }}>Schedule</Table.ColumnHeaderCell>
                <Table.ColumnHeaderCell style={{ textAlign: 'right', width: '20%' }}>Next Run</Table.ColumnHeaderCell>
                <Table.ColumnHeaderCell style={{ textAlign: 'center', width: '10%' }}>Actions</Table.ColumnHeaderCell>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {/* Scheduler */}
              <TaskRow
                name="Upgrade Search"
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
                onEditSchedule={(newSchedule) => {
                  const updatedConfig = !config.scheduler
                    ? {
                        ...config,
                        scheduler: { enabled: false, schedule: newSchedule, unattended: false }
                      }
                    : {
                        ...config,
                        scheduler: { ...config.scheduler, schedule: newSchedule }
                      };
                  onConfigChange(updatedConfig);
                  return updatedConfig;
                }}
                onSaveConfig={onSaveConfig}
                countdown={countdowns['scheduler'] || 0}
                onManualRun={async () => {
                  try {
                    await schedulerService.runUpgradeSearch();
                    showSuccessToast('Upgrade search started');
                  } catch (error) {
                    // Error toast handled by apiClient interceptor
                  }
                }}
                onRefreshStatus={onRefreshStatus}
              />

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
                onEditSchedule={(newSchedule) => {
                  const updatedConfig = {
                    ...config,
                    tasks: { ...config.tasks, syncSchedule: newSchedule }
                  };
                  onConfigChange(updatedConfig);
                  return updatedConfig;
                }}
                onSaveConfig={onSaveConfig}
                countdown={countdowns['sync-scheduler'] || 0}
                onManualRun={async () => {
                  try {
                    await schedulerService.runMediaSync();
                    showSuccessToast('Media library sync started');
                  } catch (error) {
                    // Error toast handled by apiClient interceptor
                  }
                }}
                onRefreshStatus={onRefreshStatus}
              />
            </Table.Body>
          </Table.Root>
        </Flex>
      </Card>
    </Flex>
  );
}
