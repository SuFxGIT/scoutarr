import { useParams, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Flex,
  Heading,
  Card,
  Text,
  Separator,
  Spinner,
  Box,
  Button,
  Badge,
} from '@radix-ui/themes';
import { ChevronLeftIcon } from '@radix-ui/react-icons';
import { format } from 'date-fns';
import { fetchCfScoreHistory } from '../services/mediaLibraryService';
import { useNavigation } from '../contexts/NavigationContext';
import { formatAppName } from '../utils/helpers';
import { ExternalLinkIcon } from '@radix-ui/react-icons';
import { useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { APP_TYPES } from '../utils/constants';
import type { CfScoreHistoryEntry } from '@scoutarr/shared';

const MAX_CHART_BARS = 120;

function CfScoreChart({ history }: { history: CfScoreHistoryEntry[] }) {
  const chronological = [...history].reverse();
  const sampled = chronological.length > MAX_CHART_BARS
    ? chronological.filter((_, i) => i % Math.ceil(chronological.length / MAX_CHART_BARS) === 0)
    : chronological;
  const scores = sampled.map(h => h.score ?? 0);
  const max = Math.max(...scores, 1);
  const min = Math.min(...scores, 0);
  const range = max - min || 1;

  return (
    <Flex direction="column" gap="2">
      <Flex justify="between">
        <Text size="1" color="gray">Max: {max}</Text>
        <Text size="1" color="gray">Min: {min}</Text>
      </Flex>
      <Flex gap="1" align="end" style={{ height: 300 }}>
        {sampled.map((entry, i) => {
          const score = entry.score ?? 0;
          const heightPct = ((score - min) / range) * 100;
          return (
            <Box
              key={i}
              style={{
                flex: 1,
                minWidth: 3,
                height: `${Math.max(heightPct, 4)}%`,
                backgroundColor: score >= 0 ? 'var(--accent-9)' : 'var(--red-9)',
                borderRadius: 'var(--radius-1)',
              }}
              title={`${entry.score ?? 'N/A'} — ${format(new Date(entry.recordedAt), 'PPpp')}`}
            />
          );
        })}
      </Flex>
      {sampled.length > 0 && (
        <Flex justify="between">
          <Text size="1" color="gray">
            {format(new Date(sampled[0].recordedAt), 'PP')}
          </Text>
          {sampled.length > 2 && (
            <Text size="1" color="gray">
              {format(new Date(sampled[Math.floor(sampled.length / 2)].recordedAt), 'PP')}
            </Text>
          )}
          <Text size="1" color="gray">
            {format(new Date(sampled[sampled.length - 1].recordedAt), 'PP')}
          </Text>
        </Flex>
      )}
    </Flex>
  );
}

function ScoreStats({ history }: { history: CfScoreHistoryEntry[] }) {
  const scores = history.map(h => h.score).filter((s): s is number => s !== null);
  const current = scores.length > 0 ? scores[0] : null;
  const highest = scores.length > 0 ? Math.max(...scores) : null;
  const lowest = scores.length > 0 ? Math.min(...scores) : null;

  return (
    <Flex gap="3" wrap="wrap">
      <Card variant="surface" style={{ flex: '1 1 120px' }}>
        <Flex direction="column" align="center" gap="1">
          <Text size="1" color="gray">Current</Text>
          <Text size="5" weight="bold">{current ?? '-'}</Text>
        </Flex>
      </Card>
      <Card variant="surface" style={{ flex: '1 1 120px' }}>
        <Flex direction="column" align="center" gap="1">
          <Text size="1" color="gray">Highest</Text>
          <Text size="5" weight="bold" style={{ color: 'var(--green-11)' }}>{highest ?? '-'}</Text>
        </Flex>
      </Card>
      <Card variant="surface" style={{ flex: '1 1 120px' }}>
        <Flex direction="column" align="center" gap="1">
          <Text size="1" color="gray">Lowest</Text>
          <Text size="5" weight="bold" style={{ color: 'var(--red-11)' }}>{lowest ?? '-'}</Text>
        </Flex>
      </Card>
      <Card variant="surface" style={{ flex: '1 1 120px' }}>
        <Flex direction="column" align="center" gap="1">
          <Text size="1" color="gray">Records</Text>
          <Text size="5" weight="bold">{history.length}</Text>
        </Flex>
      </Card>
    </Flex>
  );
}

function buildArrUrl(appType: string, instanceUrl: string, externalId: string): string {
  const base = instanceUrl.replace(/\/$/, '');
  switch (appType) {
    case 'radarr': return `${base}/movie/${externalId}`;
    case 'sonarr': return `${base}/series/${externalId}`;
    case 'lidarr': return `${base}/artist/${externalId}`;
    case 'readarr': return `${base}/author/${externalId}`;
    default: return base;
  }
}

function CfScoreHistory() {
  const { appType, instanceId, mediaId } = useParams<{
    appType: string;
    instanceId: string;
    mediaId: string;
  }>();
  const [searchParams] = useSearchParams();
  const title = searchParams.get('title') || 'Unknown';
  const { handleNavigation } = useNavigation();

  const { data, isLoading, error } = useQuery({
    queryKey: ['cfScoreHistory', instanceId, Number(mediaId)],
    queryFn: () => fetchCfScoreHistory(appType!, instanceId!, Number(mediaId)),
    enabled: !!appType && !!instanceId && !!mediaId,
    staleTime: 60_000,
  });

  // Get externalId from search params
  const externalId = searchParams.get('externalId');
  // Get instanceUrl from config (via react-query cache)
  const queryClient = useQueryClient();
  const config = queryClient.getQueryData(['config']);
  const instanceUrl = useMemo(() => {
    if (!config || !instanceId || !appType) return null;
    const appConfig = (config as any).applications?.[appType] || [];
    const inst = appConfig.find((i: any) => i.id === instanceId);
    return inst?.url ?? null;
  }, [config, instanceId, appType]);

  return (
    <Box width="100%" pt="0" mt="0">
      <Flex direction="column" gap="3">
        <Button variant="ghost" style={{ alignSelf: 'flex-start' }} onClick={() => handleNavigation('/')}>
          <ChevronLeftIcon /> Back to Dashboard
        </Button>
        {/* Redirect Link Button removed (duplicate) */}
        <Card>
          <Flex direction="column" gap="3">
            <Flex align="center" justify="between" gap="3">
              <Flex direction="column" gap="1">
                <Heading size="5">{title}</Heading>
                <Flex align="center" gap="2">
                  <Badge size="1" style={{ textTransform: 'capitalize' }}>
                    {formatAppName(appType || '')}
                  </Badge>
                  <Text size="2" color="gray">CF Score History</Text>
                  {data && data.history.length > 0 && (
                    <Text size="2" color="gray">({data.history.length} records)</Text>
                  )}
                </Flex>
              </Flex>
              {externalId && instanceUrl && appType && (
                <Button
                  variant="outline"
                  color="gray"
                  style={{ marginLeft: 16 }}
                  onClick={() => window.open(buildArrUrl(appType, instanceUrl, externalId), '_blank', 'noopener,noreferrer')}
                >
                  <ExternalLinkIcon /> Open in {formatAppName(appType)}
                </Button>
              )}
            </Flex>
            <Separator size="4" />

            {isLoading && (
              <Flex justify="center" py="6">
                <Spinner size="3" />
              </Flex>
            )}

            {error && !isLoading && (
              <Text size="2" color="red">Failed to load history.</Text>
            )}

            {data && data.history.length === 0 && (
              <Text size="2" color="gray">No history recorded yet.</Text>
            )}

            {data && data.history.length > 0 && (
              <>
                <ScoreStats history={data.history} />
                <CfScoreChart history={data.history} />
                <Separator size="4" />
                <Heading size="3">All Records</Heading>
                <Flex direction="column" gap="1">
                  {data.history.map((entry, i) => (
                    <Flex
                      key={i}
                      justify="between"
                      align="center"
                      py="1"
                      px="2"
                      style={{
                        borderBottom: i < data.history.length - 1 ? '1px solid var(--gray-4)' : 'none',
                      }}
                    >
                      <Text size="2" color="gray">
                        {format(new Date(entry.recordedAt), 'PPpp')}
                      </Text>
                      <Text
                        size="2"
                        weight="medium"
                        style={{
                          color: (entry.score ?? 0) >= 0 ? 'var(--accent-11)' : 'var(--red-11)',
                        }}
                      >
                        {entry.score ?? '-'}
                      </Text>
                    </Flex>
                  ))}
                </Flex>
              </>
            )}
          </Flex>
        </Card>
      </Flex>
    </Box>
  );
}

export default CfScoreHistory;
