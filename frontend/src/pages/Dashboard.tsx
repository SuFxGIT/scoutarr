import React, { useState, useCallback, useEffect, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Flex,
  Heading,
  Button,
  Card,
  Text,
  Separator,
  Box,
  Select,
  Badge,
  IconButton,
  Tooltip,
} from '@radix-ui/themes';
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  ArrowUpIcon,
  ArrowDownIcon,
  EyeNoneIcon,
  EyeOpenIcon,
  ExternalLinkIcon,
} from '@radix-ui/react-icons';
import { useQuery } from '@tanstack/react-query';
import { format, isToday, subWeeks, subMonths, isAfter } from 'date-fns';
import { capitalize } from 'es-toolkit';
import { ITEMS_PER_PAGE } from '../utils/constants';
import { buildArrUrl } from '../utils/helpers';
import { APP_BADGE_COLORS } from '../utils/appInfo';
import type { AppType } from '../utils/constants';
import { AppIcon } from '../components/icons/AppIcon';
import { MediaLibraryCard } from '../components/MediaLibraryCard';
import type { Stats } from '../types/api';
import type { Config } from '../types/config';
import { configService } from '../services/configService';
import { statsService } from '../services/statsService';

// ─── Layout persistence ───────────────────────────────────────────────────────

const DASHBOARD_LAYOUT_KEY = 'scoutarr-dashboard-layout';
const DASHBOARD_SCROLL_KEY = 'scoutarr-dashboard-scroll';

type CardId = 'statistics' | 'media-library' | 'recent-searches';

interface CardLayout {
  id: CardId;
  visible: boolean;
  collapsed: boolean;
  order: number;
}

const DEFAULT_LAYOUT: CardLayout[] = [
  { id: 'statistics',       visible: true, collapsed: false, order: 0 },
  { id: 'media-library',    visible: true, collapsed: false, order: 1 },
  { id: 'recent-searches',  visible: true, collapsed: false, order: 2 },
];

const CARD_LABELS: Record<CardId, string> = {
  'statistics': 'Statistics',
  'media-library': 'Media Library',
  'recent-searches': 'Search History',
};

function loadLayout(): CardLayout[] {
  try {
    const raw = localStorage.getItem(DASHBOARD_LAYOUT_KEY);
    if (!raw) return DEFAULT_LAYOUT;
    const parsed: CardLayout[] = JSON.parse(raw);
    const ids: CardId[] = ['statistics', 'media-library', 'recent-searches'];
    const hasAll = ids.every(id => parsed.some(c => c.id === id));
    return hasAll ? parsed : DEFAULT_LAYOUT;
  } catch {
    return DEFAULT_LAYOUT;
  }
}

function saveLayout(layout: CardLayout[]): void {
  try {
    localStorage.setItem(DASHBOARD_LAYOUT_KEY, JSON.stringify(layout));
  } catch {
    // ignore
  }
}

// ─── CardControls ─────────────────────────────────────────────────────────────

interface CardControlsProps {
  collapsed: boolean;
  isFirst: boolean;
  isLast: boolean;
  onToggleCollapse: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onHide: () => void;
}

function CardControls({ collapsed, isFirst, isLast, onToggleCollapse, onMoveUp, onMoveDown, onHide }: CardControlsProps) {
  return (
    <Flex align="center" gap="1" style={{ marginLeft: 'auto' }}>
      <Tooltip content={collapsed ? 'Expand' : 'Collapse'}>
        <IconButton variant="ghost" size="1" onClick={onToggleCollapse}>
          {collapsed ? <ChevronDownIcon /> : <ChevronUpIcon />}
        </IconButton>
      </Tooltip>

      <Separator orientation="vertical" style={{ height: '16px', margin: '0 6px' }} />

      <Tooltip content="Move Up">
        <IconButton variant="ghost" size="1" disabled={isFirst} onClick={onMoveUp}>
          <ArrowUpIcon />
        </IconButton>
      </Tooltip>
      <Tooltip content="Move Down">
        <IconButton variant="ghost" size="1" disabled={isLast} onClick={onMoveDown}>
          <ArrowDownIcon />
        </IconButton>
      </Tooltip>

      <Separator orientation="vertical" style={{ height: '16px', margin: '0 6px' }} />

      <Tooltip content="Hide Card">
        <IconButton variant="ghost" size="1" color="red" onClick={onHide}>
          <EyeNoneIcon />
        </IconButton>
      </Tooltip>
    </Flex>
  );
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

function Dashboard() {
  const [currentPage, setCurrentPage] = useState(1);
  const [dateFilter, setDateFilter] = useState<'all' | 'today' | 'week' | 'month'>('all');
  const [appFilter, setAppFilter] = useState<'all' | 'lidarr' | 'radarr' | 'sonarr' | 'readarr'>('all');
  const [expandedSearchKeys, setExpandedSearchKeys] = useState<Set<string>>(new Set());
  const [layout, setLayout] = useState<CardLayout[]>(loadLayout);

  const [searchParams] = useSearchParams();
  const isEditMode = searchParams.get('edit') === '1';

  // Scroll position persistence
  useEffect(() => {
    const saved = sessionStorage.getItem(DASHBOARD_SCROLL_KEY);
    if (saved) {
      const y = parseInt(saved, 10);
      requestAnimationFrame(() => {
        window.scrollTo({ top: y, behavior: 'instant' });
      });
    }

    const saveScroll = () => {
      sessionStorage.setItem(DASHBOARD_SCROLL_KEY, String(window.scrollY));
    };

    window.addEventListener('beforeunload', saveScroll);
    return () => {
      saveScroll();
      window.removeEventListener('beforeunload', saveScroll);
    };
  }, []);

  // Fetch config to resolve instance names → IDs
  const { data: config } = useQuery<Config>({
    queryKey: ['config'],
    queryFn: () => configService.getConfig(),
    staleTime: Infinity,
  });

  const resolveInstanceId = useCallback((appType: string, instanceName?: string): string | null => {
    if (!config) return null;
    const instances = config.applications[appType as keyof typeof config.applications];
    if (!instances) return null;
    if (instanceName) {
      const found = instances.find(inst => inst.name === instanceName);
      if (found) return found.id;
    }
    if (instances.length === 1) return instances[0].id;
    return null;
  }, [config]);

  const resolveInstanceUrl = useCallback((appType: string, instanceId: string | null): string | null => {
    if (!config || !instanceId) return null;
    const instances = config.applications[appType as keyof typeof config.applications];
    return instances?.find(inst => inst.id === instanceId)?.url ?? null;
  }, [config]);

  const getInstanceDisplayName = useCallback((appType: string, instanceId: string | null): string => {
    const instances = config?.applications[appType as keyof typeof config.applications];
    if (!instances || instances.length === 0) return capitalize(appType);
    if (instanceId) {
      const idx = instances.findIndex(inst => inst.id === instanceId);
      if (idx !== -1) {
        const inst = instances[idx];
        return inst.name || (instances.length === 1 ? capitalize(appType) : `${capitalize(appType)} ${idx + 1}`);
      }
    }
    return capitalize(appType);
  }, [config]);

  // Fetch stats
  const { data: stats } = useQuery<Stats>({
    queryKey: ['stats'],
    queryFn: () => statsService.getStats(),
    refetchInterval: 30000,
  });

  // ─── Layout helpers ─────────────────────────────────────────────────────────

  const updateLayout = useCallback((updater: (prev: CardLayout[]) => CardLayout[]) => {
    setLayout(prev => {
      const next = updater(prev);
      saveLayout(next);
      return next;
    });
  }, []);

  const toggleCollapsed = useCallback((id: CardId) => {
    updateLayout(prev => prev.map(c => c.id === id ? { ...c, collapsed: !c.collapsed } : c));
  }, [updateLayout]);

  const toggleVisible = useCallback((id: CardId) => {
    updateLayout(prev => prev.map(c => c.id === id ? { ...c, visible: !c.visible } : c));
  }, [updateLayout]);

  const moveCard = useCallback((id: CardId, direction: 'up' | 'down') => {
    updateLayout(prev => {
      // Only move among visible cards
      const sorted = [...prev].sort((a, b) => a.order - b.order);
      const visibleSorted = sorted.filter(c => c.visible);
      const idx = visibleSorted.findIndex(c => c.id === id);
      const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
      if (swapIdx < 0 || swapIdx >= visibleSorted.length) return prev;
      const currOrder = visibleSorted[idx].order;
      const swapOrder = visibleSorted[swapIdx].order;
      return prev.map(c => {
        if (c.id === id) return { ...c, order: swapOrder };
        if (c.id === visibleSorted[swapIdx].id) return { ...c, order: currOrder };
        return c;
      });
    });
  }, [updateLayout]);

  // ─── Stat click handler ─────────────────────────────────────────────────────

  const handleStatClick = useCallback((app: typeof appFilter) => {
    setAppFilter(app);
    setCurrentPage(1);
    setExpandedSearchKeys(new Set());
  }, []);

  // ─── Derived layout ─────────────────────────────────────────────────────────

  const sortedLayout = [...layout].sort((a, b) => a.order - b.order);
  const visibleCards = sortedLayout.filter(c => c.visible);

  // ─── Statistics card ────────────────────────────────────────────────────────

  const renderStatistics = (controls: ReactNode, collapsed: boolean) => {
    if (!stats) return null;

    let lidarrTotal = 0;
    let radarrTotal = 0;
    let sonarrTotal = 0;
    let readarrTotal = 0;

    Object.entries(stats.searchesByInstance || {}).forEach(([key, count]) => {
      if (key.startsWith('lidarr')) lidarrTotal += count as number;
      else if (key.startsWith('radarr')) radarrTotal += count as number;
      else if (key.startsWith('sonarr')) sonarrTotal += count as number;
      else if (key.startsWith('readarr')) readarrTotal += count as number;
    });

    const lidarrUpgrades = stats.upgradesByApplication?.['lidarr'] ?? 0;
    const radarrUpgrades = stats.upgradesByApplication?.['radarr'] ?? 0;
    const sonarrUpgrades = stats.upgradesByApplication?.['sonarr'] ?? 0;
    const readarrUpgrades = stats.upgradesByApplication?.['readarr'] ?? 0;
    const totalUpgrades = stats.totalUpgrades ?? 0;

    const statCardStyle = {
      flex: '1 1 200px',
      minWidth: '150px',
      cursor: 'pointer',
      transition: 'background-color 0.15s',
    };

    const handleHover = (e: React.MouseEvent<HTMLElement>, enter: boolean) => {
      e.currentTarget.style.backgroundColor = enter ? 'var(--gray-3)' : '';
    };

    return (
      <Card key="statistics">
        <Flex direction="column" gap="3">
          <Flex align="center">
            <Heading size="5">Statistics</Heading>
            {controls}
          </Flex>
          {!collapsed && (
            <>
              <Separator size="4" />
              <Flex gap="3" wrap="wrap" justify="center">
                <Card
                  variant="surface"
                  style={statCardStyle}
                  onClick={() => handleStatClick('lidarr')}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleStatClick('lidarr'); }}
                  onMouseEnter={(e: React.MouseEvent<HTMLElement>) => handleHover(e, true)}
                  onMouseLeave={(e: React.MouseEvent<HTMLElement>) => handleHover(e, false)}
                >
                  <Flex direction="column" gap="2" align="center" justify="center">
                    <Flex align="center" gap="2">
                      <AppIcon app="lidarr" size={20} variant="light" />
                      <Text size="2" color="gray">Lidarr</Text>
                    </Flex>
                    <Flex align="baseline" gap="2">
                      <Heading size="7">{lidarrTotal}</Heading>
                      <Text size="1" style={{ color: 'var(--green-11)' }}>▲ {lidarrUpgrades}</Text>
                    </Flex>
                  </Flex>
                </Card>

                <Card
                  variant="surface"
                  style={statCardStyle}
                  onClick={() => handleStatClick('radarr')}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleStatClick('radarr'); }}
                  onMouseEnter={(e: React.MouseEvent<HTMLElement>) => handleHover(e, true)}
                  onMouseLeave={(e: React.MouseEvent<HTMLElement>) => handleHover(e, false)}
                >
                  <Flex direction="column" gap="2" align="center" justify="center">
                    <Flex align="center" gap="2">
                      <AppIcon app="radarr" size={20} variant="light" />
                      <Text size="2" color="gray">Radarr</Text>
                    </Flex>
                    <Flex align="baseline" gap="2">
                      <Heading size="7">{radarrTotal}</Heading>
                      <Text size="1" style={{ color: 'var(--green-11)' }}>▲ {radarrUpgrades}</Text>
                    </Flex>
                  </Flex>
                </Card>

                <Card
                  variant="surface"
                  style={statCardStyle}
                  onClick={() => handleStatClick('all')}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleStatClick('all'); }}
                  onMouseEnter={(e: React.MouseEvent<HTMLElement>) => handleHover(e, true)}
                  onMouseLeave={(e: React.MouseEvent<HTMLElement>) => handleHover(e, false)}
                >
                  <Flex direction="column" gap="2" align="center" justify="center">
                    <Text size="2" color="gray">Total Searched</Text>
                    <Flex align="baseline" gap="2">
                      <Heading size="7">{stats.totalSearches}</Heading>
                      <Text size="1" style={{ color: 'var(--green-11)' }}>▲ {totalUpgrades}</Text>
                    </Flex>
                  </Flex>
                </Card>

                <Card
                  variant="surface"
                  style={statCardStyle}
                  onClick={() => handleStatClick('sonarr')}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleStatClick('sonarr'); }}
                  onMouseEnter={(e: React.MouseEvent<HTMLElement>) => handleHover(e, true)}
                  onMouseLeave={(e: React.MouseEvent<HTMLElement>) => handleHover(e, false)}
                >
                  <Flex direction="column" gap="2" align="center" justify="center">
                    <Flex align="center" gap="2">
                      <AppIcon app="sonarr" size={20} variant="light" />
                      <Text size="2" color="gray">Sonarr</Text>
                    </Flex>
                    <Flex align="baseline" gap="2">
                      <Heading size="7">{sonarrTotal}</Heading>
                      <Text size="1" style={{ color: 'var(--green-11)' }}>▲ {sonarrUpgrades}</Text>
                    </Flex>
                  </Flex>
                </Card>

                <Card
                  variant="surface"
                  style={statCardStyle}
                  onClick={() => handleStatClick('readarr')}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleStatClick('readarr'); }}
                  onMouseEnter={(e: React.MouseEvent<HTMLElement>) => handleHover(e, true)}
                  onMouseLeave={(e: React.MouseEvent<HTMLElement>) => handleHover(e, false)}
                >
                  <Flex direction="column" gap="2" align="center" justify="center">
                    <Flex align="center" gap="2">
                      <AppIcon app="readarr" size={20} variant="light" />
                      <Text size="2" color="gray">Readarr</Text>
                    </Flex>
                    <Flex align="baseline" gap="2">
                      <Heading size="7">{readarrTotal}</Heading>
                      <Text size="1" style={{ color: 'var(--green-11)' }}>▲ {readarrUpgrades}</Text>
                    </Flex>
                  </Flex>
                </Card>
              </Flex>
              {stats.lastSearch && (
                <Text size="2" color="gray">
                  Last search: {format(new Date(stats.lastSearch), 'PPpp')}
                </Text>
              )}
            </>
          )}
        </Flex>
      </Card>
    );
  };

  // ─── Media Library card ─────────────────────────────────────────────────────
  // MediaLibraryCard renders its own <Card> with heading.
  // We pass controls via headerActions prop; when collapsed we show a stub card.

  const renderMediaLibrary = (controls: ReactNode, collapsed: boolean) => (
    <Box key="media-library">
      {collapsed ? (
        <Card>
          <Flex align="center">
            <Heading size="5">Media Library</Heading>
            {controls}
          </Flex>
        </Card>
      ) : (
        <MediaLibraryCard config={config} headerActions={controls} />
      )}
    </Box>
  );

  // ─── Recent Searches card ───────────────────────────────────────────────────

  const renderRecentSearches = (controls: ReactNode, collapsed: boolean) => {
    if (!stats) return null;

    const allSearches = stats.recentSearches || [];

    const filteredSearches = allSearches
      .filter(search => {
        const searchDate = new Date(search.timestamp);
        switch (dateFilter) {
          case 'today': return isToday(searchDate);
          case 'week': return isAfter(searchDate, subWeeks(new Date(), 1));
          case 'month': return isAfter(searchDate, subMonths(new Date(), 1));
          default: return true;
        }
      })
      .filter(search => {
        if (appFilter === 'all') return true;
        return search.application === appFilter;
      });

    const totalItems = filteredSearches.length;
    const totalPages = Math.ceil(totalItems / ITEMS_PER_PAGE);
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    const currentItems = filteredSearches.slice(startIndex, startIndex + ITEMS_PER_PAGE);

    return (
      <Box key="recent-searches">
        <Card>
          <Flex direction="column" gap="3">
            <Flex align="center" gap="3">
              <Heading size="5">Search History</Heading>
              <Flex align="center" gap="2">
                <Text size="2" weight="medium">App:</Text>
                <Select.Root value={appFilter} onValueChange={(value: string) => {
                  setAppFilter(value as typeof appFilter);
                  setCurrentPage(1);
                  setExpandedSearchKeys(new Set());
                }}>
                  <Select.Trigger style={{ minWidth: '110px' }} />
                  <Select.Content position="popper" sideOffset={5}>
                    <Select.Item value="all">All Apps</Select.Item>
                    <Select.Item value="lidarr">Lidarr</Select.Item>
                    <Select.Item value="radarr">Radarr</Select.Item>
                    <Select.Item value="sonarr">Sonarr</Select.Item>
                    <Select.Item value="readarr">Readarr</Select.Item>
                  </Select.Content>
                </Select.Root>
              </Flex>
              <Flex align="center" gap="2">
                <Text size="2" weight="medium">Filter:</Text>
                <Select.Root value={dateFilter} onValueChange={(value: string) => {
                  setDateFilter(value as typeof dateFilter);
                  setCurrentPage(1);
                  setExpandedSearchKeys(new Set());
                }}>
                  <Select.Trigger style={{ minWidth: '120px' }} />
                  <Select.Content position="popper" sideOffset={5}>
                    <Select.Item value="all">All Time</Select.Item>
                    <Select.Item value="today">Today</Select.Item>
                    <Select.Item value="week">Last 7 Days</Select.Item>
                    <Select.Item value="month">Last 30 Days</Select.Item>
                  </Select.Content>
                </Select.Root>
              </Flex>
              {totalItems > 0 && (
                <Text size="2" color="gray">
                  {totalItems} {totalItems === 1 ? 'search' : 'searches'}
                </Text>
              )}
              {controls}
            </Flex>

            {!collapsed && (
              <>
                <Separator size="4" />
                {totalItems === 0 ? (
                  <Box p="4">
                    <Text size="2" color="gray" align="center">
                      {dateFilter === 'all' && appFilter === 'all'
                        ? 'No recent searches yet'
                        : 'No searches found for the selected filters'}
                    </Text>
                  </Box>
                ) : (
                  <>
                    <Flex direction="column" gap="0">
                      {currentItems.map((search, idx) => {
                        const key = `${currentPage}-${idx}`;
                        const isExpanded = expandedSearchKeys.has(key);
                        const timestamp = new Date(search.timestamp);
                        const instanceId = resolveInstanceId(search.application, search.instance);
                        const appName = getInstanceDisplayName(search.application, instanceId);
                        const itemsPreview = search.items.length > 0
                          ? search.items.slice(0, 3).map((i: { id: number; title: string }) => i.title).join(', ') +
                            (search.items.length > 3 ? ` +${search.items.length - 3} more` : '')
                          : 'No items';

                        return (
                          <Box
                            key={idx}
                            style={{
                              borderBottom: idx < currentItems.length - 1 ? '1px solid var(--gray-6)' : 'none',
                            }}
                          >
                            {/* Summary row */}
                            <Flex
                              py="2"
                              px="3"
                              align="center"
                              gap="3"
                              justify="between"
                              style={{
                                cursor: 'pointer',
                                transition: 'background-color 0.15s',
                              }}
                              onClick={() => {
                                setExpandedSearchKeys(prev => {
                                  const next = new Set(prev);
                                  if (next.has(key)) next.delete(key);
                                  else next.add(key);
                                  return next;
                                });
                              }}
                              onMouseEnter={(e: React.MouseEvent<HTMLElement>) =>
                                (e.currentTarget.style.backgroundColor = 'var(--gray-2)')
                              }
                              onMouseLeave={(e: React.MouseEvent<HTMLElement>) =>
                                (e.currentTarget.style.backgroundColor = 'transparent')
                              }
                            >
                              <Flex align="center" gap="2" style={{ flex: 1, minWidth: 0 }}>
                                <AppIcon app={search.application} size={16} variant="light" />
                                <Badge size="1" color={APP_BADGE_COLORS[search.application as AppType] ?? 'indigo'} style={{ textTransform: 'capitalize', flexShrink: 0 }}>
                                  {appName}
                                </Badge>
                                <Text size="2" style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {itemsPreview}
                                </Text>
                              </Flex>
                              <Flex align="center" gap="3" style={{ flexShrink: 0 }}>
                                <Text size="2" color="gray">
                                  {search.count} {search.count === 1 ? 'item' : 'items'}
                                </Text>
                                <Text size="2" color="gray" style={{ minWidth: '140px', textAlign: 'right' }}>
                                  {format(timestamp, 'PPp')}
                                </Text>
                                {isExpanded ? <ChevronUpIcon /> : <ChevronDownIcon />}
                              </Flex>
                            </Flex>

                            {/* Expanded items */}
                            {isExpanded && (
                              <Box
                                px="4"
                                py="2"
                                onClick={(e: React.MouseEvent) => e.stopPropagation()}
                                style={{
                                  borderTop: '1px solid var(--gray-5)',
                                  backgroundColor: 'var(--gray-2)',
                                }}
                              >
                                {search.items.length === 0 ? (
                                  <Text size="2" color="gray">No items recorded for this search.</Text>
                                ) : (
                                  <Flex direction="column" gap="1">
                                    {search.items.map((item: { id: number; title: string; externalId?: string; upgraded?: boolean }) => {
                                      const cfHistoryUrl = instanceId
                                        ? `/cf-history/${search.application}/${instanceId}/${item.id}?title=${encodeURIComponent(item.title)}${item.externalId ? `&externalId=${encodeURIComponent(item.externalId)}` : ''}`
                                        : null;
                                      const instanceUrl = resolveInstanceUrl(search.application, instanceId);
                                      const arrUrl = item.externalId && instanceUrl
                                        ? buildArrUrl(search.application, instanceUrl, item.externalId)
                                        : null;

                                      return (
                                        <Flex key={item.id} align="center" gap="2" style={{ padding: '0.2rem 0' }}>
                                          {arrUrl && (
                                            <Tooltip content={`Open in ${search.application.charAt(0).toUpperCase() + search.application.slice(1)}`}>
                                              <IconButton
                                                size="1"
                                                variant="ghost"
                                                color="gray"
                                                onClick={() => window.open(arrUrl, '_blank', 'noopener,noreferrer')}
                                              >
                                                <ExternalLinkIcon />
                                              </IconButton>
                                            </Tooltip>
                                          )}
                                          {cfHistoryUrl ? (
                                            <Flex align="center" gap="1" style={{ flex: 1, minWidth: 0 }}>
                                              <a
                                                href={cfHistoryUrl}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                style={{
                                                  textDecoration: 'none',
                                                  color: 'var(--accent-11)',
                                                  fontSize: 'var(--font-size-2)',
                                                  overflow: 'hidden',
                                                  textOverflow: 'ellipsis',
                                                  whiteSpace: 'nowrap',
                                                }}
                                              >
                                                {item.title}
                                              </a>
                                              {item.upgraded && (
                                                <Text size="1" style={{ color: 'var(--green-11)', lineHeight: 1, flexShrink: 0 }}>▲</Text>
                                              )}
                                            </Flex>
                                          ) : (
                                            <Flex align="center" gap="1" style={{ flex: 1, minWidth: 0 }}>
                                              <Text size="2" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.title}</Text>
                                              {item.upgraded && (
                                                <Text size="1" style={{ color: 'var(--green-11)', lineHeight: 1, flexShrink: 0 }}>▲</Text>
                                              )}
                                            </Flex>
                                          )}
                                        </Flex>
                                      );
                                    })}
                                  </Flex>
                                )}
                              </Box>
                            )}
                          </Box>
                        );
                      })}
                    </Flex>

                    {totalPages > 1 && (
                      <Flex align="center" justify="center" gap="2" mt="1">
                        <Button
                          variant="outline"
                          size="2"
                          onClick={() => {
                            setCurrentPage(prev => Math.max(1, prev - 1));
                            setExpandedSearchKeys(new Set());
                          }}
                          disabled={currentPage === 1}
                        >
                          <ChevronLeftIcon /> Previous
                        </Button>
                        <Flex gap="1" align="center">
                          {(() => {
                            const pages = [];
                            const pageRangeDisplayed = 5;
                            const marginPagesDisplayed = 2;

                            const addPageButton = (page: number) => (
                              <Button
                                key={page}
                                variant={currentPage === page ? 'solid' : 'soft'}
                                size="2"
                                onClick={() => {
                                  setCurrentPage(page);
                                  setExpandedSearchKeys(new Set());
                                }}
                              >
                                {page}
                              </Button>
                            );

                            const addEllipsis = (key: string) => (
                              <Text key={key} size="2" style={{ padding: '0 0.5rem' }}>...</Text>
                            );

                            for (let i = 1; i <= Math.min(marginPagesDisplayed, totalPages); i++) {
                              pages.push(addPageButton(i));
                            }

                            const rangeStart = Math.max(marginPagesDisplayed + 1, currentPage - Math.floor(pageRangeDisplayed / 2));
                            const rangeEnd = Math.min(totalPages - marginPagesDisplayed, currentPage + Math.floor(pageRangeDisplayed / 2));

                            if (rangeStart > marginPagesDisplayed + 1) {
                              pages.push(addEllipsis('ellipsis-start'));
                            }

                            for (let i = rangeStart; i <= rangeEnd; i++) {
                              if (i > marginPagesDisplayed && i <= totalPages - marginPagesDisplayed) {
                                pages.push(addPageButton(i));
                              }
                            }

                            if (rangeEnd < totalPages - marginPagesDisplayed) {
                              pages.push(addEllipsis('ellipsis-end'));
                            }

                            for (let i = Math.max(totalPages - marginPagesDisplayed + 1, marginPagesDisplayed + 1); i <= totalPages; i++) {
                              pages.push(addPageButton(i));
                            }

                            return pages;
                          })()}
                        </Flex>
                        <Button
                          variant="outline"
                          size="2"
                          onClick={() => {
                            setCurrentPage(prev => Math.min(totalPages, prev + 1));
                            setExpandedSearchKeys(new Set());
                          }}
                          disabled={currentPage === totalPages}
                        >
                          Next <ChevronRightIcon />
                        </Button>
                      </Flex>
                    )}
                  </>
                )}
              </>
            )}
          </Flex>
        </Card>
      </Box>
    );
  };

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <Box width="100%" pt="0" mt="0">
      <Flex direction="column" gap="3">
        {sortedLayout.map((cardConfig) => {
          if (!cardConfig.visible) {
            if (!isEditMode) return null;
            return (
              <Card
                key={cardConfig.id}
                variant="surface"
                style={{ opacity: 0.6, border: '2px dashed var(--gray-6)' }}
              >
                <Flex align="center" justify="between" py="1">
                  <Text size="2" color="gray">
                    {CARD_LABELS[cardConfig.id]} (hidden)
                  </Text>
                  <Button size="1" variant="soft" onClick={() => toggleVisible(cardConfig.id)}>
                    <EyeOpenIcon /> Show
                  </Button>
                </Flex>
              </Card>
            );
          }

          const visibleIdx = visibleCards.findIndex(c => c.id === cardConfig.id);
          const controls = isEditMode ? (
            <CardControls
              collapsed={cardConfig.collapsed}
              isFirst={visibleIdx === 0}
              isLast={visibleIdx === visibleCards.length - 1}
              onToggleCollapse={() => toggleCollapsed(cardConfig.id)}
              onMoveUp={() => moveCard(cardConfig.id, 'up')}
              onMoveDown={() => moveCard(cardConfig.id, 'down')}
              onHide={() => toggleVisible(cardConfig.id)}
            />
          ) : null;

          switch (cardConfig.id) {
            case 'statistics':
              return renderStatistics(controls, cardConfig.collapsed);
            case 'media-library':
              return renderMediaLibrary(controls, cardConfig.collapsed);
            case 'recent-searches':
              return renderRecentSearches(controls, cardConfig.collapsed);
            default:
              return null;
          }
        })}
      </Flex>
    </Box>
  );
}

export default Dashboard;
