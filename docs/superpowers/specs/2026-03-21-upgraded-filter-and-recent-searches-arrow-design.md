# Design: Upgraded Filter & Recent Searches Green Arrow

**Date:** 2026-03-21  
**Status:** Approved

---

## Features

### Feature 1: "Show upgraded only" checkbox in the CF Score column

### Feature 2: Green ▲ next to upgraded items in the Recent Searches card

---

## Shared Helper: `isUpgraded`

Both the CF score column cell renderer and the new filter guard use the same condition:

```
customFormatScore != null && previousCfScore != null && customFormatScore > previousCfScore
```

This logic is extracted into a small pure function in `MediaLibraryCard.tsx`:

```ts
function isUpgraded(row: { customFormatScore?: number | null; previousCfScore?: number | null }): boolean {
  return (
    row.customFormatScore != null &&
    row.previousCfScore != null &&
    row.customFormatScore > row.previousCfScore
  );
}
```

The cell renderer's `increased` variable is replaced with `isUpgraded(row)`. The filter guard in `gridRows` also calls `isUpgraded(row)`. No logic duplication.

---

## Feature 1: CF Score "Show Upgraded Only" Checkbox

### State

Add a new `showUpgradedOnly` boolean state in `MediaLibraryCard.tsx`, following the same pattern as `showMissingOnly` and `showMonitoredOnly`:

```ts
const [showUpgradedOnly, setShowUpgradedOnly] = useState(false);
```

### Filter guard in `gridRows` memo

After the existing `showMonitoredOnly` filter block, add:

```ts
if (showUpgradedOnly) {
  filtered = filtered.filter(item => isUpgraded(item));
}
```

Also add `showUpgradedOnly` to the `useMemo` dependency array (currently ends with `showMissingOnly, showMonitoredOnly`). Without this, React will not recompute grid rows when the checkbox is toggled.

### Column header UI

The CF Score column's `renderHeaderCell` currently uses `<TextFilterHeaderCell>`. Update it to render the existing `TextFilterHeaderCell` plus a Radix `<Flex>` with a `<Checkbox>` and a `▲` label below the text filter input:

```tsx
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

The `Checkbox` and `Text` are from `@radix-ui/themes`.

---

## Feature 2: Green ▲ in Recent Searches Items

### Backend — new private method `getUpgradedItemIds()`

Add a private synchronous method to `StatsService` that, given an `instanceId` and a list of `mediaIds`, returns a `Set<number>` of the IDs that are currently upgraded (current CF score > previous CF score):

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

This uses the same "current score vs previous (LIMIT 1 OFFSET 1)" concept as `getPreviousCfScores()`. Only direct `media_id` matches are checked — Sonarr series-level items (which use `series_id`) are left as `upgraded: false` since CF scores are per-episode, not per-series.

> **DRY note:** The existing `getPreviousCfScores(instanceId)` retrieves ALL previous scores for an entire instance as a `Map<media_id, score>` using `ROW_NUMBER()` — used by the media library endpoint. `getUpgradedItemIds` is a different query: it is scoped to a specific list of `mediaIds`, joins `media_library` to compare the current score in the same query, and only returns a boolean result (Set membership) rather than score values. The two methods serve different call sites with different return shapes and cannot be shared.

### Backend — extend enrichment call sites

`enrichItemsWithExternalId()` is called in two places:
1. `calculateStats()` — for `recentSearches`
2. `getRecentSearches()` — for paginated searches

Both call sites use **concise-body** arrow functions (`row => ({...})`). Each must be **converted to a block body** before inserting the multi-statement enrichment logic.

After converting, the pattern at each call site is:

```ts
const enriched = this.enrichItemsWithExternalId(rawItems, row.instance_id);
const upgradedIds = row.instance_id
  ? this.getUpgradedItemIds(row.instance_id, enriched.map(i => i.id))
  : new Set<number>();
return {
  ...otherFields,
  items: enriched.map(i => ({ ...i, upgraded: upgradedIds.has(i.id) }))
};
```

### Shared / backend types — `SearchEntry` items

Add `upgraded?: boolean` to the item shape in two places:

**`backend/src/services/statsService.ts`**:
```ts
export interface SearchEntry {
  timestamp: string;
  application: string;
  instance?: string;
  count: number;
  items: Array<{ id: number; title: string; externalId?: string; upgraded?: boolean }>;
}
```

**`shared/src/types/api.ts`** — the inline `recentSearches` array items:
```ts
items: Array<{ id: number; title: string; externalId?: string; upgraded?: boolean }>;
```

### Frontend — Dashboard.tsx render

The item `.map()` callback at line 599 has an **explicit inline type annotation** — update it to include `upgraded?: boolean`:
```tsx
search.items.map((item: { id: number; title: string; externalId?: string; upgraded?: boolean }) => {
```

After the `cfHistoryUrl` link / plain `<Text>` (i.e., after the item title), add:

```tsx
{item.upgraded && (
  <Text size="1" style={{ color: 'var(--green-11)', lineHeight: 1 }}>▲</Text>
)}
```

This renders the same ▲ glyph with the same color as the media library table. No new component needed.

---

## What Does NOT Change

- The cell renderer's ▲/▼ Tooltip markup is unchanged (only `increased` → `isUpgraded(row)`)
- `getPreviousCfScores()` — untouched
- History table schema — no changes
- No schema migrations

---

## `filtersActive` — toolbar indicator

`filtersActive` (computed inline around line 1052 of `MediaLibraryCard.tsx`) currently is:
```ts
const filtersActive = showMonitoredOnly || showMissingOnly || (isSonarr && episodeMode);
```
Update to include `showUpgradedOnly`:
```ts
const filtersActive = showMonitoredOnly || showMissingOnly || showUpgradedOnly || (isSonarr && episodeMode);
```
This keeps the "Apply Filters" button blue whenever the upgraded-only checkbox is active.

---

## Acceptance Criteria

- `isUpgraded()` is defined once; both the cell render and the filter guard call it.
- Checking the checkbox in the CF score column header filters the grid to show only rows where `isUpgraded(row)` is true.
- Unchecking returns all rows (subject to other active filters).
- When the upgraded-only checkbox is checked, `filtersActive === true` and the "Apply Filters" button turns blue.
- `showUpgradedOnly` is included in the `gridRows` `useMemo` dependency array.
- When all rows fail `isUpgraded`, the grid renders empty (react-data-grid default "No rows to display") — no additional empty-state UI required.
- Items in the Recent Searches card show `▲` in green when `item.upgraded === true`.
- Items with `upgraded === false` or `undefined` show no arrow.
- TypeScript compiles without errors across all packages.
