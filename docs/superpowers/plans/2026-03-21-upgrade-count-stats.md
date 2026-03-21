# Upgrade Count in Stats Tiles — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show a green ▲ upgrade count next to search counts in the dashboard stats tiles, driven by an all-time count of CF score increase events from `cf_score_history`.

**Architecture:** A new private synchronous method `getUpgradeCounts()` in `statsService.ts` queries `cf_score_history` using a `LAG()` window function to count score-increase events per app. The result is merged into `calculateStats()`'s return value. Two fields are added to the `Stats` interface (shared + local). The frontend Dashboard reads the new fields and renders `▲ N` in green next to each search count.

**Tech Stack:** TypeScript 5, better-sqlite3, React 19, Radix UI Themes

**Spec:** `docs/superpowers/specs/2026-03-21-upgrade-count-stats-design.md`

---

## File Map

| File | Change |
|------|--------|
| `shared/src/types/api.ts` | Add `totalUpgrades` and `upgradesByApplication` to `Stats` interface |
| `backend/src/services/statsService.ts` | Add `getUpgradeCounts()` method; call it in `calculateStats()`; update local `Stats` interface; fix 3 fallback return objects |
| `frontend/src/pages/Dashboard.tsx` | Render `▲ N` (green, smaller) next to each search count in `renderStatistics()` |

---

## Task 1: Update shared `Stats` type

**Skills:** none

**Files:**
- Modify: `shared/src/types/api.ts`

- [ ] **Step 1: Add the two new fields to `Stats` in `shared/src/types/api.ts`**

  Open `shared/src/types/api.ts`. Find the `Stats` interface (around line 56). It currently ends at `lastSearch?: string;`. Add two fields after `lastSearch`:

  ```ts
  export interface Stats {
    totalSearches: number;
    searchesByApplication: Record<string, number>;
    searchesByInstance: Record<string, number>;
    recentSearches: Array<{
      timestamp: string;
      application: string;
      instance?: string;
      count: number;
      items: Array<{ id: number; title: string; externalId?: string }>;
    }>;
    lastSearch?: string;
    totalUpgrades: number;
    upgradesByApplication: Record<string, number>;
  }
  ```

- [ ] **Step 2: Verify no TypeScript errors in shared**

  ```bash
  cd /mnt/user/other/projects/scoutarr
  npx tsc -p shared/tsconfig.json --noEmit
  ```
  Expected: no output (no errors).

- [ ] **Step 3: Commit**

  ```bash
  git add shared/src/types/api.ts
  git commit -m "feat: add totalUpgrades and upgradesByApplication to Stats type"
  ```

---

## Task 2: Backend — `getUpgradeCounts()` + wire into `calculateStats()`

**Skills:** `nodejs-backend-patterns`

**Files:**
- Modify: `backend/src/services/statsService.ts`

- [ ] **Step 1: Load the nodejs-backend-patterns skill**

  Read `/mnt/user/other/projects/scoutarr/.agents/skills/nodejs-backend-patterns/SKILL.md` in full before proceeding.

- [ ] **Step 2: Add `getUpgradeCounts()` as a private synchronous method in `statsService.ts`**

  Add this method directly above `calculateStats()` (around line 250):

  ```ts
  private getUpgradeCounts(): Record<string, number> {
    if (!this.db) return {};
    const stmt = this.db.prepare(`
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
    `);
    const rows = stmt.all() as Array<{ application: string; upgrades: number }>;
    const result: Record<string, number> = {};
    for (const row of rows) {
      result[row.application] = row.upgrades;
    }
    return result;
  }
  ```

- [ ] **Step 3: Update the local `Stats` interface in `statsService.ts`**

  The local `export interface Stats` at the top of `statsService.ts` (around line 20) must gain the same two fields:

  ```ts
  export interface Stats {
    totalSearches: number;
    searchesByApplication: Record<string, number>;
    searchesByInstance: Record<string, number>;
    recentSearches: SearchEntry[];
    lastSearch?: string;
    totalUpgrades: number;
    upgradesByApplication: Record<string, number>;
  }
  ```

- [ ] **Step 4: Update the three fallback `Stats` return objects**

  There are three places that return a bare `Stats` object when the DB is unavailable or an error occurred. All three need `totalUpgrades: 0, upgradesByApplication: {}` added.

  **Fallback 1** — `getStats()` uninitialized-DB guard (around line 346):
  ```ts
  return {
    totalSearches: 0,
    searchesByApplication: {},
    searchesByInstance: {},
    recentSearches: [],
    totalUpgrades: 0,
    upgradesByApplication: {}
  };
  ```

  **Fallback 2** — `getStats()` catch block (around line 375):
  ```ts
  return {
    totalSearches: 0,
    searchesByApplication: {},
    searchesByInstance: {},
    recentSearches: [],
    totalUpgrades: 0,
    upgradesByApplication: {}
  };
  ```

  **Fallback 3** — `calculateStats()` uninitialized-DB guard (around line 254):
  ```ts
  return {
    totalSearches: 0,
    searchesByApplication: {},
    searchesByInstance: {},
    recentSearches: [],
    lastSearch: undefined,
    totalUpgrades: 0,
    upgradesByApplication: {}
  };
  ```

- [ ] **Step 5: Call `getUpgradeCounts()` inside `calculateStats()` and include results in return**

  In `calculateStats()`, just before the final `return` statement (the one that returns `totalSearches, searchesByApplication, searchesByInstance, recentSearches, lastSearch`), add:

  ```ts
  const upgradesByApplication = this.getUpgradeCounts();
  const totalUpgrades = Object.values(upgradesByApplication).reduce((a, b) => a + b, 0);
  ```

  Then extend the return object:
  ```ts
  return {
    totalSearches,
    searchesByApplication,
    searchesByInstance,
    recentSearches,
    lastSearch,
    totalUpgrades,
    upgradesByApplication
  };
  ```

- [ ] **Step 6: Verify no TypeScript errors in backend**

  ```bash
  cd /mnt/user/other/projects/scoutarr
  npx tsc -p backend/tsconfig.json --noEmit
  ```
  Expected: no output (no errors).

- [ ] **Step 7: Commit**

  ```bash
  git add backend/src/services/statsService.ts
  git commit -m "feat: add getUpgradeCounts() to statsService and wire into calculateStats()"
  ```

---

## Task 3: Frontend — render upgrade count in stats tiles

**Skills:** `shadcn`, `tailwind-design-system`

**Files:**
- Modify: `frontend/src/pages/Dashboard.tsx`

- [ ] **Step 1: Load skills**

  Read `/mnt/user/other/projects/scoutarr/.agents/skills/shadcn/SKILL.md` and `/mnt/user/other/projects/scoutarr/.agents/skills/tailwind-design-system/SKILL.md` in full before proceeding.

- [ ] **Step 2: Add upgrade count variables in `renderStatistics()`**

  In `renderStatistics()`, after the four `xxxTotal` variables are computed (after the `forEach` loop, around line 263), add:

  ```ts
  const lidarrUpgrades = stats.upgradesByApplication?.['lidarr'] ?? 0;
  const radarrUpgrades = stats.upgradesByApplication?.['radarr'] ?? 0;
  const sonarrUpgrades = stats.upgradesByApplication?.['sonarr'] ?? 0;
  const readarrUpgrades = stats.upgradesByApplication?.['readarr'] ?? 0;
  const totalUpgrades = stats.totalUpgrades ?? 0;
  ```

- [ ] **Step 3: Update each per-app stat tile to show upgrade count**

  For each of the four per-app tiles (Lidarr, Radarr, Sonarr, Readarr), find the `<Heading size="7">{xxxTotal}</Heading>` line and wrap it along with the upgrade count in a `<Flex>`. Example for Lidarr — replace:

  ```tsx
  <Heading size="7">{lidarrTotal}</Heading>
  ```

  with:

  ```tsx
  <Flex align="baseline" gap="2">
    <Heading size="7">{lidarrTotal}</Heading>
    <Text size="1" style={{ color: 'var(--green-11)' }}>▲ {lidarrUpgrades}</Text>
  </Flex>
  ```

  Apply the same pattern for Radarr (`{radarrUpgrades}`), Sonarr (`{sonarrUpgrades}`), and Readarr (`{readarrUpgrades}`).

- [ ] **Step 4: Update the Total tile to show total upgrades**

  In the Total Searched tile, find `<Heading size="7">{stats.totalSearches}</Heading>` and apply the same pattern:

  ```tsx
  <Flex align="baseline" gap="2">
    <Heading size="7">{stats.totalSearches}</Heading>
    <Text size="1" style={{ color: 'var(--green-11)' }}>▲ {totalUpgrades}</Text>
  </Flex>
  ```

- [ ] **Step 5: Verify no TypeScript errors in frontend**

  ```bash
  cd /mnt/user/other/projects/scoutarr
  npx tsc -p frontend/tsconfig.json --noEmit
  ```
  Expected: no output (no errors).

- [ ] **Step 6: Smoke-test visually**

  Start the dev servers:
  ```bash
  npm run dev
  ```
  Open `http://localhost:7291`. Check the Statistics card on the Dashboard:
  - Each per-app tile should show the search count and `▲ N` in green underneath/next to it.
  - The Total tile should also show `▲ N` in green.
  - If there's no CF score history yet, the upgrade counts should show `▲ 0` (not undefined or blank).

- [ ] **Step 7: Commit**

  ```bash
  git add frontend/src/pages/Dashboard.tsx
  git commit -m "feat: show upgrade count alongside search count in stats tiles"
  ```
