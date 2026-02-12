import { useState } from 'react';
import {
  Flex,
  Heading,
  Button,
  Card,
  Text,
  Separator,
  Dialog,
  Box,
  Select,
  Badge,
} from '@radix-ui/themes';
import { ChevronLeftIcon, ChevronRightIcon } from '@radix-ui/react-icons';
import { useQuery } from '@tanstack/react-query';
import { format, isToday, subWeeks, subMonths, isAfter } from 'date-fns';
import { formatAppName } from '../utils/helpers';
import { ITEMS_PER_PAGE } from '../utils/constants';
import { AppIcon } from '../components/icons/AppIcon';
import { MediaLibraryCard } from '../components/MediaLibraryCard';
import type { Stats } from '../types/api';
import type { Config } from '../types/config';
import { configService } from '../services/configService';
import { statsService } from '../services/statsService';

function Dashboard() {
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedSearch, setSelectedSearch] = useState<Stats['recentSearches'][number] | null>(null);
  const [dateFilter, setDateFilter] = useState<'all' | 'today' | 'week' | 'month'>('all');

  // Fetch config to get instance names
  const { data: config } = useQuery<Config>({
    queryKey: ['config'],
    queryFn: () => configService.getConfig(),
    enabled: true,
    staleTime: Infinity,
  });

  // Fetch stats - load from database on mount
  // Stats are persisted in the backend database, so we should load them on mount
  const { data: stats } = useQuery<Stats>({
    queryKey: ['stats'],
    queryFn: () => statsService.getStats(),
    enabled: true, // Fetch on mount to load cached stats from database
    staleTime: Infinity, // Stats never go stale - they only change when a run happens
  });

  return (
    <Box width="100%" pt="0" mt="0">
      <Flex direction="column" gap="3">
        {/* Section 1: Statistics */}
        {stats && (() => {
          // Calculate totals for all app types
          let lidarrTotal = 0;
          let radarrTotal = 0;
          let sonarrTotal = 0;
          let readarrTotal = 0;
          
          Object.entries(stats.searchesByInstance || {}).forEach(([instanceKey, count]) => {
            if (instanceKey.startsWith('lidarr')) {
              lidarrTotal += count as number;
            } else if (instanceKey.startsWith('radarr')) {
              radarrTotal += count as number;
            } else if (instanceKey.startsWith('sonarr')) {
              sonarrTotal += count as number;
            } else if (instanceKey.startsWith('readarr')) {
              readarrTotal += count as number;
            }
          });
          
          return (
            <Card>
              <Flex direction="column" gap="3">
                <Heading size="5">Statistics</Heading>
                <Separator size="4" />
                <Flex gap="3" wrap="wrap" justify="center">
                  <Card variant="surface" style={{ flex: '1 1 200px', minWidth: '150px' }}>
                    <Flex direction="column" gap="2" align="center" justify="center">
                      <Flex align="center" gap="2">
                        <AppIcon app="lidarr" size={20} variant="light" />
                        <Text size="2" color="gray" align="center">Lidarr</Text>
                      </Flex>
                      <Heading size="7" align="center">{lidarrTotal}</Heading>
                    </Flex>
                  </Card>
                  <Card variant="surface" style={{ flex: '1 1 200px', minWidth: '150px' }}>
                    <Flex direction="column" gap="2" align="center" justify="center">
                      <Flex align="center" gap="2">
                        <AppIcon app="radarr" size={20} variant="light" />
                        <Text size="2" color="gray" align="center">Radarr</Text>
                      </Flex>
                      <Heading size="7" align="center">{radarrTotal}</Heading>
                    </Flex>
                  </Card>
                  <Card variant="surface" style={{ flex: '1 1 200px', minWidth: '150px' }}>
                    <Flex direction="column" gap="2" align="center" justify="center">
                      <Text size="2" color="gray" align="center">Total Searched</Text>
                      <Heading size="7" align="center">{stats.totalSearches}</Heading>
                    </Flex>
                  </Card>
                  <Card variant="surface" style={{ flex: '1 1 200px', minWidth: '150px' }}>
                    <Flex direction="column" gap="2" align="center" justify="center">
                      <Flex align="center" gap="2">
                        <AppIcon app="sonarr" size={20} variant="light" />
                        <Text size="2" color="gray" align="center">Sonarr</Text>
                      </Flex>
                      <Heading size="7" align="center">{sonarrTotal}</Heading>
                    </Flex>
                  </Card>
                  <Card variant="surface" style={{ flex: '1 1 200px', minWidth: '150px' }}>
                    <Flex direction="column" gap="2" align="center" justify="center">
                      <Flex align="center" gap="2">
                        <AppIcon app="readarr" size={20} variant="light" />
                        <Text size="2" color="gray" align="center">Readarr</Text>
                      </Flex>
                      <Heading size="7" align="center">{readarrTotal}</Heading>
                    </Flex>
                  </Card>
                </Flex>
                {stats.lastSearch && (
                  <Text size="2" color="gray">
                    Last search: {format(new Date(stats.lastSearch), 'PPpp')}
                  </Text>
                )}
              </Flex>
            </Card>
          );
        })()}

        {/* Section 2: Media Library */}
        <MediaLibraryCard config={config} />

        {/* Section 3: Recent Searches */}
        {stats && (() => {
          const allSearches = stats.recentSearches || [];

          // Filter by date
          const filteredSearches = allSearches.filter(search => {
            const searchDate = new Date(search.timestamp);
            switch (dateFilter) {
              case 'today':
                return isToday(searchDate);
              case 'week':
                return isAfter(searchDate, subWeeks(new Date(), 1));
              case 'month':
                return isAfter(searchDate, subMonths(new Date(), 1));
              default:
                return true;
            }
          });

          const totalItems = filteredSearches.length;
          const totalPages = Math.ceil(totalItems / ITEMS_PER_PAGE);
          const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
          const endIndex = startIndex + ITEMS_PER_PAGE;
          const currentItems = filteredSearches.slice(startIndex, endIndex);

          return (
            <Card>
              <Flex direction="column" gap="3">
                <Flex align="center" justify="between" wrap="wrap" gap="3">
                  <Heading size="5">Recent Searches</Heading>
                  <Flex align="center" gap="3">
                    <Flex align="center" gap="2">
                      <Text size="2" weight="medium">Filter:</Text>
                      <Select.Root value={dateFilter} onValueChange={(value: string) => {
                        setDateFilter(value as typeof dateFilter);
                        setCurrentPage(1);
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
                  </Flex>
                </Flex>
                <Separator size="4" />
                {totalItems === 0 ? (
                  <Box p="4">
                    <Text size="2" color="gray" align="center">
                      {dateFilter === 'all' ? 'No recent searches yet' : `No searches found for ${dateFilter === 'today' ? 'today' : dateFilter === 'week' ? 'the last 7 days' : 'the last 30 days'}`}
                    </Text>
                  </Box>
                ) : (
                  <>
                    <Flex direction="column" gap="0">
                      {currentItems.map((search, idx) => {
                        const timestamp = new Date(search.timestamp);
                        const appName = search.instance
                          ? `${search.application} (${search.instance})`
                          : search.application;
                        const itemsPreview = search.items.length > 0
                          ? search.items.slice(0, 3).map((i: { id: number; title: string }) => i.title).join(', ') + (search.items.length > 3 ? ` +${search.items.length - 3} more` : '')
                          : 'No items';

                        return (
                          <Box
                            key={idx}
                            py="2"
                            px="3"
                            style={{
                              borderBottom: idx < currentItems.length - 1 ? '1px solid var(--gray-6)' : 'none',
                              cursor: 'pointer',
                              transition: 'background-color 0.15s'
                            }}
                            onClick={() => setSelectedSearch(search)}
                            onMouseEnter={(e: React.MouseEvent<HTMLDivElement>) => e.currentTarget.style.backgroundColor = 'var(--gray-2)'}
                            onMouseLeave={(e: React.MouseEvent<HTMLDivElement>) => e.currentTarget.style.backgroundColor = 'transparent'}
                          >
                            <Flex align="center" gap="3" justify="between">
                              <Flex align="center" gap="2" style={{ flex: 1, minWidth: 0 }}>
                                <AppIcon app={search.application} size={16} variant="light" />
                                <Badge size="1" style={{ textTransform: 'capitalize', flexShrink: 0 }}>
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
                              </Flex>
                            </Flex>
                          </Box>
                        );
                      })}
                    </Flex>
                    {totalPages > 1 && (
                      <Flex align="center" justify="center" gap="2" mt="1">
                        <Button
                          variant="outline"
                          size="2"
                          onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                          disabled={currentPage === 1}
                        >
                          <ChevronLeftIcon /> Previous
                        </Button>
                        <Flex gap="1" align="center">
                          {(() => {
                            const pages = [];
                            const pageRangeDisplayed = 5;
                            const marginPagesDisplayed = 2;

                            // Helper to add page button
                            const addPageButton = (page: number) => (
                              <Button
                                key={page}
                                variant={currentPage === page ? 'solid' : 'soft'}
                                size="2"
                                onClick={() => setCurrentPage(page)}
                              >
                                {page}
                              </Button>
                            );

                            // Helper to add ellipsis
                            const addEllipsis = (key: string) => (
                              <Text key={key} size="2" style={{ padding: '0 0.5rem' }}>...</Text>
                            );

                            // Always show first pages
                            for (let i = 1; i <= Math.min(marginPagesDisplayed, totalPages); i++) {
                              pages.push(addPageButton(i));
                            }

                            // Calculate range around current page
                            const rangeStart = Math.max(marginPagesDisplayed + 1, currentPage - Math.floor(pageRangeDisplayed / 2));
                            const rangeEnd = Math.min(totalPages - marginPagesDisplayed, currentPage + Math.floor(pageRangeDisplayed / 2));

                            // Add ellipsis before range if needed
                            if (rangeStart > marginPagesDisplayed + 1) {
                              pages.push(addEllipsis('ellipsis-start'));
                            }

                            // Add pages in range
                            for (let i = rangeStart; i <= rangeEnd; i++) {
                              if (i > marginPagesDisplayed && i <= totalPages - marginPagesDisplayed) {
                                pages.push(addPageButton(i));
                              }
                            }

                            // Add ellipsis after range if needed
                            if (rangeEnd < totalPages - marginPagesDisplayed) {
                              pages.push(addEllipsis('ellipsis-end'));
                            }

                            // Always show last pages
                            for (let i = Math.max(totalPages - marginPagesDisplayed + 1, marginPagesDisplayed + 1); i <= totalPages; i++) {
                              pages.push(addPageButton(i));
                            }

                            return pages;
                          })()}
                        </Flex>
                        <Button
                          variant="outline"
                          size="2"
                          onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                          disabled={currentPage === totalPages}
                        >
                          Next <ChevronRightIcon />
                        </Button>
                      </Flex>
                    )}
                  </>
                )}
              </Flex>
            </Card>
          );
        })()}

        {/* Dialog for viewing all items in a recent search entry */}
        <Dialog.Root
          open={!!selectedSearch}
          onOpenChange={(open: boolean) => {
            if (!open) {
              setSelectedSearch(null);
            }
          }}
        >
          <Dialog.Content maxWidth="480px">
            {selectedSearch && (
              <Flex direction="column" gap="3">
                <Dialog.Title>
                  {selectedSearch.instance
                    ? `${formatAppName(selectedSearch.application)} (${selectedSearch.instance})`
                    : formatAppName(selectedSearch.application)}
                </Dialog.Title>
                <Dialog.Description>
                  {selectedSearch.count} {selectedSearch.count === 1 ? 'item' : 'items'} searched on{' '}
                  {format(new Date(selectedSearch.timestamp), 'PPpp')}
                </Dialog.Description>
                <Separator size="4" />
                {selectedSearch.items.length === 0 ? (
                  <Text size="2" color="gray">
                    No items recorded for this search.
                  </Text>
                ) : (
                  <Flex
                    direction="column"
                    gap="2"
                    style={{ maxHeight: 'min(40vh, 400px)', overflowY: 'auto' }}
                    >
                    {selectedSearch.items.map((item) => (
                      <Text
                        key={item.id}
                        size="2"
                        style={{ padding: '0.25rem 0' }}
                      >
                        {item.title}
                      </Text>
                    ))}
                  </Flex>
                )}
              </Flex>
            )}
          </Dialog.Content>
        </Dialog.Root>
      </Flex>
    </Box>
  );
}

export default Dashboard;
