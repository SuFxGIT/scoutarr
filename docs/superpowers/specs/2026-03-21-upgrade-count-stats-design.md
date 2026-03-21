# Design: Upgrade Count in Stats Tiles

**Date:** 2026-03-21  
**Status:** Approved

---

## Problem

The Dashboard stats tiles currently show only the number of **search triggers** per app and in total. Users cannot tell how many of those searches resulted in an actual upgrade (i.e., a CF score increase — the green ▲ shown in the media library table). This count is valuable feedback: it shows whether Scoutarr is finding and downloading better releases.

---

## Goal

Display an upgrade count alongside the existing search count in each stats tile (per-app and total). The upgrade count is the **total number of upgrade events** — each time any media item's CF score increased counts as one upgrade. (An item upgraded three times contributes 3.) This matches the spirit of "how many green arrows have ever appeared."

> **Retention note:** `cf_score_history` is pruned by a configurable retention window (default 90 days), so this count covers the retained history, not necessarily all time.

---

## Data Source

`cf_score_history` stores a row for every CF score change per `(instance_id, media_id)` pair. The existing `getPreviousCfScores()` method in `statsService.ts` uses a `ROW_NUMBER()` window query that retrieves only the second-most-recent score (for the ▲/▼ indicator). The upgrade count uses the same `LAG()` / window approach but aggregates: count rows where `score > prev_score`, grouped by app. No new data collection is required and no schema migrations are needed.

---

## Changes

### 1. Backend — `statsService.ts`

Add a new **private synchronous** method `getUpgradeCounts()`:

```sql
SELECT i.application, COUNT(*) AS upgrades
FROM (
  SELECT
    instance_id,
    LAG(score) OVER (PARTITION BY instance_id, media_id ORDER BY recorded_at) AS prev_score,
    score
  FROM cf_score_history
) sub
JOIN instances i ON sub.instance_id = i.instance_id
WHERE sub.prev_score IS NOT NULL AND sub.score > sub.prev_score
GROUP BY i.application
```

Map the rows to `Record<string, number>`:
```ts
const result: Record<string, number> = {};
for (const row of rows) {
  result[row.application] = row.upgrades;
}
return result;
```

Returns `{}` if DB not initialized.

`totalUpgrades` is derived in TypeScript as the sum of all values in the returned map.

This method is called **inside `calculateStats()`** so it flows through the existing `getStats()` path without changing the route handler.

### 2. Backend — `statsService.ts` local `Stats` interface + fallbacks

The `Stats` interface is **duplicated** — once in `shared/src/types/api.ts` (authoritative) and once locally in `statsService.ts` (used by `getStats()` return type). Both must gain the two new fields:

```ts
totalUpgrades: number;
upgradesByApplication: Record<string, number>;
```

There are **three** `Stats`-shaped return objects that must be updated with `totalUpgrades: 0, upgradesByApplication: {}`:
1. The `if (!this.db)` early-return in `getStats()` (uninitialized DB guard)
2. The `catch` fallback in `getStats()` (error fallback)
3. The `if (!this.db)` early-return in `calculateStats()` (inner guard)

### 3. Shared Types — `shared/src/types/api.ts`

Add to the `Stats` interface (same two fields as above).

### 4. Frontend — `Dashboard.tsx`

In `renderStatistics()`, update each stat tile to show the upgrade count next to the search count, in smaller green text using `var(--green-11)` (matching the ▲ color already used in the media library table). Format:

```
142  ▲ 17
     (smaller, green)
```

The per-app tiles look up by hardcoded lowercase app name:
- Lidarr: `stats.upgradesByApplication['lidarr'] ?? 0`
- Radarr: `stats.upgradesByApplication['radarr'] ?? 0`
- Sonarr: `stats.upgradesByApplication['sonarr'] ?? 0`
- Readarr: `stats.upgradesByApplication['readarr'] ?? 0`

The Total tile uses `stats.totalUpgrades`.

Note: existing per-app search counts are derived from `searchesByInstance` via prefix matching; upgrade counts use direct `upgradesByApplication` lookup. Both aggregate all instances of that app — this is intentional.

---

## What Does NOT Change

- The green ▲ rendering logic in `MediaLibraryCard.tsx` — untouched.
- The `getPreviousCfScores()` method — untouched.
- The `history` table and existing search-count logic — untouched.
- No schema migrations required.

---

## Acceptance Criteria

- Each per-app stats tile shows `<searchCount>` and `▲ <upgradeCount>` (green, smaller text).
- The Total tile shows the same.
- `upgradesByApplication` and `totalUpgrades` default to `{}` / `0` in all three fallback return sites.
- All upgrade count logic lives in `statsService.ts`; the route handler is unchanged.
- TypeScript compiles without errors (both `Stats` interface locations and all three fallback objects updated).
