import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Dialog,
  Flex,
  Text,
  Spinner,
  Box,
  Separator,
  IconButton,
} from '@radix-ui/themes';
import { MagnifyingGlassIcon } from '@radix-ui/react-icons';
import { format } from 'date-fns';
import { fetchCfScoreHistory } from '../services/mediaLibraryService';
import type { CfScoreHistoryEntry } from '@scoutarr/shared';

interface CfScoreHistoryDialogProps {
  appType: string;
  instanceId: string;
  mediaId: number;
  title: string;
}

const MAX_CHART_BARS = 90;

function CfScoreChart({ history }: { history: CfScoreHistoryEntry[] }) {
  // Show oldest→newest, cap bars so each stays readable
  const chronological = [...history].reverse();
  const sampled = chronological.length > MAX_CHART_BARS
    ? chronological.filter((_, i) => i % Math.ceil(chronological.length / MAX_CHART_BARS) === 0)
    : chronological;
  const scores = sampled.map(h => h.score ?? 0);
  const max = Math.max(...scores, 1);
  const min = Math.min(...scores, 0);
  const range = max - min || 1;

  return (
    <Flex gap="1" align="end" style={{ height: 120 }}>
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
  );
}

export function CfScoreHistoryDialog({
  appType, instanceId, mediaId, title
}: CfScoreHistoryDialogProps) {
  const [open, setOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['cfScoreHistory', instanceId, mediaId],
    queryFn: () => fetchCfScoreHistory(appType, instanceId, mediaId),
    enabled: open,
    staleTime: 60_000,
  });

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger>
        <IconButton
          size="1"
          variant="ghost"
          color="gray"
          className="cf-history-trigger"
          onClick={(e: React.MouseEvent) => e.stopPropagation()}
        >
          <MagnifyingGlassIcon />
        </IconButton>
      </Dialog.Trigger>
      <Dialog.Content maxWidth="480px">
        <Flex direction="column" gap="3">
          <Dialog.Title>{title}</Dialog.Title>
          <Dialog.Description size="2" color="gray">
            CF Score History
            {data && data.history.length > 0 && ` (${data.history.length} records)`}
          </Dialog.Description>
          <Separator size="4" />

          {isLoading && (
            <Flex justify="center" py="4">
              <Spinner size="3" />
            </Flex>
          )}

          {data && data.history.length === 0 && (
            <Text size="2" color="gray">No history recorded yet.</Text>
          )}

          {data && data.history.length > 0 && (
            <>
              <CfScoreChart history={data.history} />
              <Separator size="4" />
              <Flex
                direction="column"
                gap="1"
                style={{ maxHeight: 'min(40vh, 400px)', overflowY: 'auto' }}
              >
                {data.history.map((entry, i) => (
                  <Flex key={i} justify="between" align="center" py="1" px="1">
                    <Text size="2" color="gray">
                      {format(new Date(entry.recordedAt), 'PPpp')}
                    </Text>
                    <Text size="2" weight="medium">
                      {entry.score ?? '-'}
                    </Text>
                  </Flex>
                ))}
              </Flex>
            </>
          )}
        </Flex>
      </Dialog.Content>
    </Dialog.Root>
  );
}
