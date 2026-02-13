import React from 'react';
import { Card, Flex, Text, Tooltip, TextField, Switch, Select, Separator, Button } from '@radix-ui/themes';
import * as Collapsible from '@radix-ui/react-collapsible';
import { TrashIcon, ChevronDownIcon, ChevronRightIcon, QuestionMarkCircledIcon } from '@radix-ui/react-icons';
import { capitalize } from 'es-toolkit';
import { AppIcon } from './icons/AppIcon';
import type { AppType } from '../utils/constants';
import type { StarrInstanceConfig } from '../utils/appInfo';
import type { RadarrInstance, SonarrInstance, LidarrInstance, ReadarrInstance } from '../types/config';

export type InstanceCardProps = {
  appType: AppType;
  appInfo: { name: string; mediaType: string; mediaTypePlural: string; defaultPort: string };
  instance: StarrInstanceConfig;
  index: number;
  isExpanded: boolean;
  onExpandedChange: (open: boolean) => void;
  renderTestButton: (app: AppType, instanceId: string) => React.ReactNode;
  updateInstanceConfig: (app: AppType, instanceId: string, field: string, value: unknown) => void;
  onRemove: (app: AppType, instanceId: string) => void;
  confirmingDeleteId: string | null;
  setConfirmingDeleteId: (id: string | null) => void;
  qualityProfiles: Record<string, { id: number; name: string }[]>;
  loadingProfiles: Record<string, boolean>;
  confirmingClearTags: string | null;
  setConfirmingClearTags: (id: string | null) => void;
  onClearTags: (app: AppType, instanceId: string) => void;
  clearTagsPending: boolean;
};

export function InstanceCard({
  appType,
  appInfo,
  instance,
  index,
  isExpanded,
  onExpandedChange,
  renderTestButton,
  updateInstanceConfig,
  onRemove,
  confirmingDeleteId,
  setConfirmingDeleteId,
  qualityProfiles,
  loadingProfiles,
  confirmingClearTags,
  setConfirmingClearTags,
  onClearTags,
  clearTagsPending,
}: InstanceCardProps) {
  const instanceKey = `${appType}-${instance.id}`;
  const profiles = qualityProfiles[instanceKey] || [];
  const isProfilesLoading = loadingProfiles[instanceKey];

  return (
    <Card style={{ alignSelf: 'flex-start', width: '100%' }}>
      <Flex direction="column" gap="2">
        <Collapsible.Root open={isExpanded} onOpenChange={onExpandedChange}>
          <Collapsible.Trigger asChild>
            <div
              style={{ cursor: 'pointer', userSelect: 'none', WebkitUserSelect: 'none' }}
              onClick={(e: React.MouseEvent<HTMLDivElement>) => e.stopPropagation()}
            >
              <Flex align="center" gap="2" width="100%" justify="between" p="3">
                <Flex align="center" gap="2">
                  <AppIcon app={appType} size={18} variant="light" />
                  <Text size="3" weight="bold">{instance.name || `${appInfo.name} ${index + 1}`}</Text>
                </Flex>
                <Flex align="center" gap="2">
                  {confirmingDeleteId === instanceKey ? (
                    <Flex gap="1" align="center">
                      <Text size="1" color="gray">Delete?</Text>
                      <Button
                        variant="solid"
                        color="red"
                        size="1"
                        onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
                          e.stopPropagation();
                          onRemove(appType, instance.id);
                        }}
                      >
                        Yes
                      </Button>
                      <Button
                        variant="outline"
                        size="1"
                        onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
                          e.stopPropagation();
                          setConfirmingDeleteId(null);
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
                        onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
                          e.stopPropagation();
                          setConfirmingDeleteId(instanceKey);
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
                  onCheckedChange={(checked: boolean) => updateInstanceConfig(appType, instance.id, 'enabled', checked)}
                />
              </Flex>

              <Separator size="4" />

              <Flex direction="column" gap="2">
                <Flex align="center" gap="1">
                  <Text size="2" weight="medium">Name (optional)</Text>
                  <Tooltip content={`A name to identify this instance (e.g., 'Main ${appInfo.name}', '4K ${appInfo.name}').`}>
                    <QuestionMarkCircledIcon style={{ cursor: 'help', color: 'var(--gray-9)', width: '14px', height: '14px' }} />
                  </Tooltip>
                </Flex>
                <TextField.Root
                  value={instance.name || ''}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateInstanceConfig(appType, instance.id, 'name', e.target.value)}
                  placeholder={`${appInfo.name} ${index + 1}`}
                />
              </Flex>

              <Flex direction="column" gap="2">
                <Flex align="center" gap="1">
                  <Text size="2" weight="medium">{appInfo.name} URL</Text>
                  <Tooltip content={`The base URL where your ${appInfo.name} instance is accessible (e.g., http://localhost:${appInfo.defaultPort} or https://${appType}.example.com)`}>
                    <QuestionMarkCircledIcon style={{ cursor: 'help', color: 'var(--gray-9)', width: '14px', height: '14px' }} />
                  </Tooltip>
                </Flex>
                <TextField.Root
                  placeholder={`http://localhost:${appInfo.defaultPort}`}
                  value={instance.url || ''}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateInstanceConfig(appType, instance.id, 'url', e.target.value)}
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
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateInstanceConfig(appType, instance.id, 'apiKey', e.target.value)}
                />
              </Flex>

              {renderTestButton(appType, instance.id)}

              <Flex direction="column" gap="2">
                <Flex align="center" gap="1">
                  <Text size="2" weight="medium">Number of {capitalize(appInfo.mediaTypePlural)} to Search</Text>
                  <Tooltip content={`How many ${appInfo.mediaTypePlural} to randomly select and search for upgrades each time the script runs. Use 'max' to search all matching ${appInfo.mediaTypePlural}.`}>
                    <QuestionMarkCircledIcon style={{ cursor: 'help', color: 'var(--gray-9)', width: '14px', height: '14px' }} />
                  </Tooltip>
                </Flex>
                <TextField.Root
                  type="number"
                  min={1}
                  value={instance.count === '' as unknown ? '' : (instance.count ?? 5).toString()}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                    const val = e.target.value;
                    if (val === '') {
                      updateInstanceConfig(appType, instance.id, 'count', '' as unknown as number);
                    } else {
                      const parsed = parseInt(val);
                      if (!isNaN(parsed)) {
                        updateInstanceConfig(appType, instance.id, 'count', parsed);
                      }
                    }
                  }}
                  onBlur={() => {
                    if (!instance.count || typeof instance.count !== 'number' || instance.count < 1) {
                      updateInstanceConfig(appType, instance.id, 'count', 5);
                    }
                  }}
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
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateInstanceConfig(appType, instance.id, 'tagName', e.target.value)}
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
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateInstanceConfig(appType, instance.id, 'ignoreTag', e.target.value)}
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
                  onCheckedChange={(checked: boolean) => updateInstanceConfig(appType, instance.id, 'monitored', checked)}
                />
              </Flex>

              {appType === 'radarr' && (
                <Flex direction="column" gap="2">
                  <Flex align="center" gap="1">
                    <Text size="2" weight="medium">Movie Status</Text>
                    <Tooltip content="Only movies with this status or higher will be considered for upgrades. Released is recommended for most use cases.">
                      <QuestionMarkCircledIcon style={{ cursor: 'help', color: 'var(--gray-9)', width: '14px', height: '14px' }} />
                    </Tooltip>
                  </Flex>
                  <Select.Root
                    value={(instance as RadarrInstance).movieStatus || 'any'}
                    onValueChange={(value: string) => updateInstanceConfig('radarr', instance.id, 'movieStatus', value)}
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

              {appType === 'sonarr' && (
                <>
                  <Flex direction="column" gap="2">
                    <Flex align="center" gap="1">
                      <Text size="2" weight="medium">Series Status</Text>
                      <Tooltip content="Only series with this status will be considered for upgrades. Leave as 'Any' to include all statuses.">
                        <QuestionMarkCircledIcon style={{ cursor: 'help', color: 'var(--gray-9)', width: '14px', height: '14px' }} />
                      </Tooltip>
                    </Flex>
                    <Select.Root
                      value={(instance as SonarrInstance).seriesStatus || 'any'}
                      onValueChange={(value: string) => updateInstanceConfig('sonarr', instance.id, 'seriesStatus', value === 'any' ? '' : value)}
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

                  <Flex direction="row" align="center" justify="between" gap="2">
                    <Flex align="center" gap="1">
                      <Text size="2" weight="medium">Hide Specials</Text>
                      <Tooltip content="Hide special episodes (Season 0) from the media library. Specials are still synced and stored, just hidden from view.">
                        <QuestionMarkCircledIcon style={{ cursor: 'help', color: 'var(--gray-9)', width: '14px', height: '14px' }} />
                      </Tooltip>
                    </Flex>
                    <Switch
                      checked={(instance as SonarrInstance).hideSpecials === true}
                      onCheckedChange={(checked: boolean) => updateInstanceConfig('sonarr', instance.id, 'hideSpecials', checked)}
                    />
                  </Flex>
                </>
              )}

              {(appType === 'lidarr' || appType === 'readarr') && (
                <Flex direction="column" gap="2">
                  <Flex align="center" gap="1">
                    <Text size="2" weight="medium">{appInfo.mediaType} Status</Text>
                    <Tooltip content={`Only ${appInfo.mediaTypePlural.toLowerCase()} with this status will be considered for upgrades. Leave as 'Any' to include all statuses.`}>
                      <QuestionMarkCircledIcon style={{ cursor: 'help', color: 'var(--gray-9)', width: '14px', height: '14px' }} />
                    </Tooltip>
                  </Flex>
                  <Select.Root
                    value={appType === 'lidarr' ? ((instance as LidarrInstance).artistStatus || 'any') : ((instance as ReadarrInstance).authorStatus || 'any')}
                    onValueChange={(value: string) => {
                      const field = appType === 'lidarr' ? 'artistStatus' : 'authorStatus';
                      updateInstanceConfig(appType, instance.id, field, value === 'any' ? '' : value);
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
                  <Tooltip content={`Only ${appInfo.mediaTypePlural.toLowerCase()} using this specific quality profile will be considered. Use \"Test Connection\" to refresh the quality profiles list.`}>
                    <QuestionMarkCircledIcon style={{ cursor: 'help', color: 'var(--gray-9)', width: '14px', height: '14px' }} />
                  </Tooltip>
                </Flex>
                <Flex gap="2" align="center" style={{ width: '100%' }}>
                  <Flex style={{ flex: 1, minWidth: 0 }}>
                    {(() => {
                      const hasUrlAndApiKey = instance.url && instance.apiKey;

                      if (!hasUrlAndApiKey) {
                        return (
                          <Select.Root
                            value={undefined}
                            onValueChange={(_value: string) => {}}
                            disabled
                          >
                            <Select.Trigger placeholder="Configure URL and API Key first" style={{ width: '100%' }} />
                          </Select.Root>
                        );
                      }

                      if (isProfilesLoading) {
                        return (
                          <Select.Root disabled>
                            <Select.Trigger placeholder="Loading profiles..." style={{ width: '100%' }} />
                          </Select.Root>
                        );
                      }

                      if (profiles.length === 0) {
                        const savedProfileName = instance.qualityProfileName;
                        if (savedProfileName) {
                          return (
                            <Select.Root
                              value={savedProfileName}
                              onValueChange={(_value: string) => {}}
                              disabled
                            >
                              <Select.Trigger style={{ width: '100%' }} />
                              <Select.Content position="popper" sideOffset={5}>
                                <Select.Item value={savedProfileName}>{savedProfileName}</Select.Item>
                              </Select.Content>
                            </Select.Root>
                          );
                        }
                        return (
                          <Select.Root
                            value={undefined}
                            onValueChange={(_value: string) => {}}
                            disabled
                          >
                            <Select.Trigger placeholder="No profiles synced. Click 'Test Connection' to sync." style={{ width: '100%' }} />
                          </Select.Root>
                        );
                      }

                      const selectedProfileName = instance.qualityProfileName || '';
                      const selectValue = selectedProfileName || '__all__';

                      return (
                        <Select.Root
                          value={selectValue}
                          onValueChange={(value: string) => {
                            const configValue = value === '__all__' ? '' : value;
                            updateInstanceConfig(appType, instance.id, 'qualityProfileName', configValue);
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
                </Flex>
              </Flex>

              <Separator size="4" />

              <Flex direction="row" align="center" justify="between" gap="2">
                <Text size="2" weight="medium">Clear Tags</Text>
                {confirmingClearTags === instanceKey ? (
                  <Flex gap="2" align="center">
                    <Text size="1" color="gray">Confirm?</Text>
                    <Button
                      variant="solid"
                      size="2"
                      color="red"
                      onClick={() => onClearTags(appType, instance.id)}
                      disabled={clearTagsPending}
                    >
                      {clearTagsPending ? 'Clearing...' : 'Confirm'}
                    </Button>
                    <Button
                      variant="outline"
                      size="2"
                      onClick={() => setConfirmingClearTags(null)}
                      disabled={clearTagsPending}
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
                      onClick={() => setConfirmingClearTags(instanceKey)}
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
}
