import { Flex, Badge } from '@radix-ui/themes';
import { APP_TYPES } from '../utils/constants';
import { AppIcon } from './icons/AppIcon';

interface ConnectionStatusBadgesProps {
  connectionStatus: Record<string, unknown>;
}

export function ConnectionStatusBadges({ connectionStatus }: ConnectionStatusBadgesProps) {
  // Group status entries by app type
  const groupedStatus: Record<string, { connected: number; total: number; configured: boolean }> = {};

  // Initialize all app types
  APP_TYPES.forEach(appType => {
    groupedStatus[appType] = { connected: 0, total: 0, configured: true };
  });

  // Process connection status entries
  Object.entries(connectionStatus).forEach(([key, status]) => {
    if (key === 'scheduler') return;

    // Type guard to check if status has configured property
    const statusObj = status as Record<string, unknown>;

    // Check if it's an app type directly (indicates "not configured" status)
    if (APP_TYPES.includes(key as typeof APP_TYPES[number])) {
      if (statusObj.configured === false) {
        groupedStatus[key].configured = false;
      }
      return;
    }

    // It's an instance ID (e.g., "radarr-123" or "sonarr-instance-id")
    const appType = key.split('-')[0];
    if (APP_TYPES.includes(appType as typeof APP_TYPES[number])) {
      groupedStatus[appType].total++;
      if (statusObj.connected) {
        groupedStatus[appType].connected++;
      }
      groupedStatus[appType].configured = true; // Has at least one instance configured
    }
  });

  // Generate badges for each app type
  return (
    <>
      {APP_TYPES.map(appType => {
        const stats = groupedStatus[appType];
        const appName = appType.charAt(0).toUpperCase() + appType.slice(1);
        let statusMessage = '';
        let badgeColor: 'green' | 'gray' | 'red' = 'red';

        if (!stats.configured) {
          statusMessage = 'Not Configured';
          badgeColor = 'gray';
        } else if (stats.connected > 0) {
          statusMessage = `${stats.connected} Instance${stats.connected === 1 ? '' : 's'} connected`;
          badgeColor = 'green';
        } else if (stats.total > 0) {
          statusMessage = `${stats.total} Instance${stats.total === 1 ? '' : 's'} disconnected`;
          badgeColor = 'red';
        } else {
          statusMessage = 'Not Configured';
          badgeColor = 'gray';
        }

        return (
          <Badge
            key={appType}
            color={badgeColor}
            size="2"
          >
            <Flex align="center" gap="1">
              <AppIcon app={appType} size={14} variant="light" />
              {appName}: {statusMessage}
            </Flex>
          </Badge>
        );
      })}
    </>
  );
}
