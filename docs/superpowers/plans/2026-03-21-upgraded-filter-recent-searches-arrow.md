# Upgraded Filter & Recent Searches Green Arrow — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "show upgraded only" checkbox to the CF Score column header that filters the media library grid, and display a green ▲ next to upgraded items in the Recent Searches card on the Dashboard.

**Architecture:** A shared `isUpgraded()` pure function replaces the inline `increased` variable in the cell renderer and drives the new filter guard. The backend extends both enrichment call sites to annotate search items with `upgraded: boolean` using a new `getUpgradedItemIds()` helper that queries `cf_score_history` for the previous score. The Dashboard item renderer reads `item.upgraded` to show the arrow with no new abstractions.

**Tech Stack:** TypeScript 5, React 19, Radix UI Themes (`Checkbox`, `Text`, `Flex`), better-sqlite3, useMemo/useState

---

## File Map

| File | Change |
|------|--------|
| `shared/src/types/api.ts` | Add `upgraded?: boolean` to `recentSearches` items inline type |
| `backend/src/services/statsService.ts` | Add `upgraded?: boolean` to `SearchEntry.items`; add `getUpgradedItemIds()`; convert both enrichment call sites to block-body with `upgraded` enrichment |
| `frontend/src/components/MediaLibraryCard.tsx` | Add `isUpgraded()` helper; `showUpgradedOnly` state; filter guard in `gridRows`; `filtersActive` update; CF Score header checkbox |
| `frontend/src/pages/Dashboard.tsx` | Update item type annotation; add ▲ after title |

---

### Task 1: Add `upgraded?` to shared and backend types

**Skills:** nodejs-backend-patterns

**Files:**
- Modify: `shared/src/types/api.ts` line 65
- Modify: `backend/src/services/statsService.ts` line 18

- [ ] **Step 1: Load skills**

  Read `backend/src/services/statsService.ts` lines 12–20 and `shared/src/types/api.ts` lines 60–70 to confirm current content before editing.

- [ ] **Step 2: Update `shared/src/types/api.ts` — add `upgraded?` to recentSearches items**

  File: `shared/src/types/api.ts`, around line 65.

  Old:
  ```ts
      items: Array<{ id: number; title: string; externalId?: string }>;
  ```
  Located inside the `recentSearches` array shape (the only `externalId` line in `Stats`).

  New:
  ```ts
      items: Array<{ id: number; title: string; externalId?: string; upgraded?: boolean }>;
  ```

- [ ] **Step 3: Update `backend/src/services/statsService.ts` — add `upgraded?` to `SearchEntry.items`**

  File: `backend/src/services/statsService.ts`, around line 18.

  Old:
  ```ts
    items: Array<{ id: number; title: string; externalId?: string }>;
  ```
  Located inside the `SearchEntry` interface (the only `externalId` line in that interface).

  New:
  ```ts
    items: Array<{ id: number; title: string; externalId?: string; upgraded?: boolean }>;
  ```

- [ ] **Step 4: Build shared package (required — frontend imports from `@scoutarr/shared`)**

  ```bash
  node /mnt/user/other/projects/scoutarr/node_modules/typescript/bin/tsc -p /mnt/user/other/projects/scoutarr/shared/tsconfig.json
  ```
  Expected: no output, exit 0.

- [ ] **Step 5: Type-check backend**

  ```bash
  node /mnt/user/other/projects/scoutarr/node_modules/typescript/bin/tsc -p /mnt/user/other/projects/scoutarr/backend/tsconfig.json --noEmit
  ```
  Expected: no errors.

- [ ] **Step 6: Commit**

  ```bash
  cd /mnt/user/other/projects/scoutarr
  git add shared/src/types/api.ts backend/src/services/statsService.ts
  git commit -m "feat: add upgraded? flag to search entry item types"
  ```

---

### Task 2: Backend — `getUpgradedItemIds()` + enrich both call sites

**Skills:** nodejs-backend-patterns

**Files:**
- Modify: `backend/src/services/statsService.ts` (add method ~line 230, patch lines ~339–351, patch lines ~452–462)

- [ ] **Step 1: Load skills**

  Read `backend/src/services/statsService.ts` lines 185–230 (end of `enrichItemsWithExternalId`), lines 335–360 (`calculateStats` enrichment), and lines 448–470 (`getRecentSearches` enrichment) to confirm exact text before editing.

- [ ] **Step 2: Add `getUpgradedItemIds()` after `enrichItemsWithExternalId()`**

  The `enrichItemsWithExternalId` method ends with:
  ```ts
        return items.map(item => ({ ...item, externalId: externalIdMap.get(item.id) }));
      } catch {
        return items;
      }
    }
  ```

  Append the new method immediately after that closing `}`:
  ```ts
    private getUpgradedItemIds(instanceId: string, mediaIds: number[]): Set<number> {
      if (!this.db || mediaIds.length === 0) return new Set();
      const placeholders = mediaIds.map(() => '?').join(',');
      const stmt = this.db.prepare(`
        SELECT m.media_id
        FROM media_library m
        WHERE m.instance_id = ?
          AND m.media_id IN (${placeholders})
          AND m.custom_format_score IS NOT NULL
          AND m.custom_format_score > (
            SELECT h.score FROM cf_score_history h
            WHERE h.instance_id = m.instance_id AND h.media_id = m.media_id
            ORDER BY h.recorded_at DESC
            LIMIT 1 OFFSET 1
          )
      `);
      const rows = stmt.all(instanceId, ...mediaIds) as Array<{ media_id: number }>;
      return new Set(rows.map(r => r.media_id));
    }
  ```

- [ ] **Step 3: Convert `calculateStats()` enrichment call site to block-body with `upgraded`**

  In `calculateStats()`, find the concise-body map (around line 339):
  ```ts
      const recentSearches: SearchEntry[] = recentResults.map(row => ({
        timestamp: row.timestamp,
        application: row.application,
        instance: row.instance || undefined,
        count: row.count,
        items: this.enrichItemsWithExternalId(
          JSON.parse(row.items) as Array<{ id: number; title: string }>,
          row.instance_id
        )
      }));
  ```

  Replace with block-body:
  ```ts
      const recentSearches: SearchEntry[] = recentResults.map(row => {
        const enriched = this.enrichItemsWithExternalId(
          JSON.parse(row.items) as Array<{ id: number; title: string }>,
          row.instance_id
        );
        const upgradedIds = row.instance_id
          ? this.getUpgradedItemIds(row.instance_id, enriched.map(i => i.id))
          : new Set<number>();
        return {
          timestamp: row.timestamp,
          application: row.application,
          instance: row.instance || undefined,
          count: row.count,
          items: enriched.map(i => ({ ...i, upgraded: upgradedIds.has(i.id) }))
        };
      });
  ```

- [ ] **Step 4: Convert `getRecentSearches()` enrichment call site to block-body with `upgraded`**

  In `getRecentSearches()`, find the concise-body map (around line 452):
  ```ts
        const searches: SearchEntry[] = results.map(row => ({
          timestamp: row.timestamp,
          application: row.application,
          instance: row.instance || undefined,
          count: row.count,
          items: this.enrichItemsWithExternalId(
            JSON.parse(row.items) as Array<{ id: number; title: string }>,
            row.instance_id
          )
        }));
  ```

  Replace with block-body:
  ```ts
        const searches: SearchEntry[] = results.map(row => {
          const enriched = this.enrichItemsWithExternalId(
            JSON.parse(row.items) as Array<{ id: number; title: string }>,
            row.instance_id
          );
          const upgradedIds = row.instance_id
            ? this.getUpgradedItemIds(row.instance_id, enriched.map(i => i.id))
            : new Set<number>();
          return {
            timestamp: row.timestamp,
            application: row.application,
            instance: row.instance || undefined,
            count: row.count,
            items: enriched.map(i => ({ ...i, upgraded: upgradedIds.has(i.id) }))
          };
        });
  ```

- [ ] **Step 5: Type-check backend**

  ```bash
  node /mnt/user/other/projects/scoutarr/node_modules/typescript/bin/tsc -p /mnt/user/other/projects/scoutarr/backend/tsconfig.json --noEmit
  ```
  Expected: no errors.

- [ ] **Step 6: Commit**

  ```bash
  cd /mnt/user/other/projects/scoutarr
  git add backend/src/services/statsService.ts
  git commit -m "feat: compute and expose upgraded flag in recent search items"
  ```

---

### Task 3: Frontend — MediaLibraryCard `isUpgraded` helper + filter checkbox

**Skills:** shadcn, tailwind-design-system

**Files:**
- Modify: `frontend/src/components/MediaLibraryCard.tsx`

- [ ] **Step 1: Load skills**

  Read `frontend/src/components/MediaLibraryCard.tsx`:
  - Lines 1–30 (imports)
  - Lines 300–325 (before-component / state declarations)
  - Lines 560–580 (filter guards in `gridRows`)
  - Lines 696–702 (end of `gridRows` dep array)
  - Lines 808–865 (CF score column `renderCell` + `renderHeaderCell`)
  - Lines 1050–1056 (`filtersActive`)

- [ ] **Step 2: Add `Checkbox` to Radix UI Themes import**

  The current import block from `@radix-ui/themes` ends without `Checkbox`. Add it:

  Old:
  ```ts
  import {
    Flex,
    Heading,
    Button,
    Card,
    Text,
    Separator,
    Spinner,
    Box,
    Select,
    Callout,
    AlertDialog,
    TextField,
    Tooltip,
    Badge,
    Switch,
    SegmentedControl,
    IconButton,
    DropdownMenu,
    Popover,
  } from '@radix-ui/themes';
  ```

  New (add `Checkbox,` before `DropdownMenu`):
  ```ts
  import {
    Flex,
    Heading,
    Button,
    Card,
    Text,
    Separator,
    Spinner,
    Box,
    Select,
    Callout,
    AlertDialog,
    TextField,
    Tooltip,
    Badge,
    Switch,
    SegmentedControl,
    IconButton,
    Checkbox,
    DropdownMenu,
    Popover,
  } from '@radix-ui/themes';
  ```

- [ ] **Step 3: Add `isUpgraded()` pure function before the component**

  Insert immediately before the `interface MediaLibraryCardProps` declaration (around line 302):

  Old:
  ```ts
  interface MediaLibraryCardProps {
    config?: Config;
    headerActions?: ReactNode;
  }
  ```

  New:
  ```ts
  function isUpgraded(row: { customFormatScore?: number | null; previousCfScore?: number | null }): boolean {
    return (
      row.customFormatScore != null &&
      row.previousCfScore != null &&
      row.customFormatScore > row.previousCfScore
    );
  }

  interface MediaLibraryCardProps {
    config?: Config;
    headerActions?: ReactNode;
  }
  ```

- [ ] **Step 4: Add `showUpgradedOnly` state**

  Old (lines 319–320):
  ```ts
    const [showMissingOnly, setShowMissingOnly] = useState(false);
    const [showMonitoredOnly, setShowMonitoredOnly] = useState(false);
  ```

  New:
  ```ts
    const [showMissingOnly, setShowMissingOnly] = useState(false);
    const [showMonitoredOnly, setShowMonitoredOnly] = useState(false);
    const [showUpgradedOnly, setShowUpgradedOnly] = useState(false);
  ```

- [ ] **Step 5: Replace `increased` variable with `isUpgraded(row)` in `renderCell`**

  In the CF score `renderCell`, find (around line 821):
  ```ts
          const increased = hasChanged && current > previous;
  ```

  Replace with:
  ```ts
          const increased = isUpgraded(row);
  ```

  The surrounding `hasChanged` and `decreased` lines are unchanged:
  ```ts
          const hasChanged = current != null && previous != null && current !== previous;
          const increased = isUpgraded(row);
          const decreased = hasChanged && current < previous;
  ```

- [ ] **Step 6: Add `showUpgradedOnly` filter guard to `gridRows` useMemo**

  After the `showMonitoredOnly` block (around line 575–577):
  ```ts
      if (showMonitoredOnly) {
        filtered = filtered.filter(item => item.monitored === true);
      }
  ```

  Insert after it:
  ```ts
      if (showUpgradedOnly) {
        filtered = filtered.filter(item => isUpgraded(item));
      }
  ```

- [ ] **Step 7: Add `showUpgradedOnly` to `gridRows` useMemo dependency array**

  Old (line 699):
  ```ts
    }, [mediaData?.media, sortColumns, columnFilters, isSonarr, episodeMode, hideSpecials, showMissingOnly, showMonitoredOnly]);
  ```

  New:
  ```ts
    }, [mediaData?.media, sortColumns, columnFilters, isSonarr, episodeMode, hideSpecials, showMissingOnly, showMonitoredOnly, showUpgradedOnly]);
  ```

- [ ] **Step 8: Update `filtersActive` to include `showUpgradedOnly`**

  Old (line 1052):
  ```ts
              const filtersActive = showMonitoredOnly || showMissingOnly || (isSonarr && episodeMode);
  ```

  New:
  ```ts
              const filtersActive = showMonitoredOnly || showMissingOnly || showUpgradedOnly || (isSonarr && episodeMode);
  ```

- [ ] **Step 9: Update CF Score column `renderHeaderCell` to include the checkbox**

  Old (the `renderHeaderCell` for `customFormatScore`):
  ```ts
          renderHeaderCell: (props) => (
            <TextFilterHeaderCell
              {...props}
              numeric
              filterValue={columnFilters.cfScore}
              onFilterChange={(value) => handleFilterChange('cfScore', value)}
            />
          )
  ```

  New:
  ```ts
          renderHeaderCell: (props) => (
            <Flex direction="column" gap="1" style={{ width: '100%' }}>
              <TextFilterHeaderCell
                {...props}
                numeric
                filterValue={columnFilters.cfScore}
                onFilterChange={(value) => handleFilterChange('cfScore', value)}
              />
              <Flex align="center" gap="1" style={{ paddingLeft: '2px' }}>
                <Checkbox
                  size="1"
                  checked={showUpgradedOnly}
                  onCheckedChange={(checked) => setShowUpgradedOnly(checked === true)}
                />
                <Text size="1" color="gray">▲ only</Text>
              </Flex>
            </Flex>
          )
  ```

- [ ] **Step 10: Type-check frontend**

  ```bash
  node /mnt/user/other/projects/scoutarr/node_modules/typescript/bin/tsc -p /mnt/user/other/projects/scoutarr/frontend/tsconfig.json --noEmit
  ```
  Expected: no errors.

- [ ] **Step 11: Commit**

  ```bash
  cd /mnt/user/other/projects/scoutarr
  git add frontend/src/components/MediaLibraryCard.tsx
  git commit -m "feat: add upgraded-only filter checkbox to CF Score column"
  ```

---

### Task 4: Frontend — Dashboard Recent Searches green ▲

**Skills:** shadcn

**Files:**
- Modify: `frontend/src/pages/Dashboard.tsx` (around line 601)

- [ ] **Step 1: Load skills**

  Read `frontend/src/pages/Dashboard.tsx` lines 595–645 to confirm the exact item `.map()` callback and title render code.

- [ ] **Step 2: Update inline type annotation at the item map callback**

  Old (~line 601):
  ```tsx
                                  {search.items.map((item: { id: number; title: string; externalId?: string }) => {
  ```

  New:
  ```tsx
                                  {search.items.map((item: { id: number; title: string; externalId?: string; upgraded?: boolean }) => {
  ```

- [ ] **Step 3: Add ▲ after item title**

  Locate the title render block inside the map. It ends with:
  ```tsx
                                          ) : (
                                            <Text size="2" style={{ flex: 1 }}>{item.title}</Text>
                                          )}
  ```

  Replace with (add `{item.upgraded && ...}` as a sibling after the conditional):
  ```tsx
                                          ) : (
                                            <Text size="2" style={{ flex: 1 }}>{item.title}</Text>
                                          )}
                                          {item.upgraded && (
                                            <Text size="1" style={{ color: 'var(--green-11)', lineHeight: 1 }}>▲</Text>
                                          )}
  ```

- [ ] **Step 4: Type-check frontend**

  ```bash
  node /mnt/user/other/projects/scoutarr/node_modules/typescript/bin/tsc -p /mnt/user/other/projects/scoutarr/frontend/tsconfig.json --noEmit
  ```
  Expected: no errors.

- [ ] **Step 5: Commit**

  ```bash
  cd /mnt/user/other/projects/scoutarr
  git add frontend/src/pages/Dashboard.tsx
  git commit -m "feat: show green arrow next to upgraded items in recent searches"
  ```
