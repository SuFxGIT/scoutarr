# Monitored Filter Bug Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix a one-line bug where `monitored = false` incorrectly filters search candidates to unmonitored-only items instead of applying no monitored filter at all.

**Architecture:** The guard condition in `applyCommonFilters` uses `!== undefined` but `monitored` is always a boolean (never `undefined`) due to the schema. Changing the condition to `=== true` makes `false` mean "no filter". Because unattended mode's tag-clearing already delegates to the same `filterMedia` → `applyCommonFilters` path, the fix is automatically inherited.

**Tech Stack:** TypeScript, Express 5, `better-sqlite3`, Zod (schema validation)

---

## Files Changed

| File | Change |
|------|--------|
| `backend/src/utils/filterUtils.ts` | Line 54: change guard condition from `!== undefined` to `=== true` |

---

### Task 1: Fix the monitored filter guard condition

**Files:**
- Modify: `backend/src/utils/filterUtils.ts:54`

**Background:**

`applyCommonFilters` in `filterUtils.ts` applies a monitored filter when `config.monitored !== undefined`. But all four instance schemas (`radarrInstanceSchema`, `sonarrInstanceSchema`, `lidarrInstanceSchema`, `readarrInstanceSchema`) in `shared/src/schemas/config.ts` define `monitored: z.boolean()` — non-optional — so it is always `true` or `false`, never `undefined`. This means the filter always runs. When the user turns "Search Monitored Only" OFF, the config stores `false`, and the filter keeps only items where `m.monitored === false` (unmonitored items), which is the opposite of the intended "no filter" behaviour.

Changing the guard to `=== true` means:
- `true` → filter to monitored items only (existing behaviour, unchanged)
- `false` → skip the filter, include all items regardless of monitored status (the fix)

Unattended mode in `search.ts` calls `processor.filterMedia(processor.config, tempAllMedia)` → `baseStarrService.filterMediaItems` → `applyCommonFilters`, so it benefits from this fix automatically.

- [ ] **Step 1: Open `backend/src/utils/filterUtils.ts` and locate the monitored filter block (around line 53–62)**

The block looks like this:

```ts
// Filter by monitored status
if (config.monitored !== undefined) {
  const before = filtered.length;
  filtered = filtered.filter(m => m.monitored === config.monitored);
  logger.debug('🔽 Filtered by monitored status', {
    before,
    after: filtered.length,
    monitored: config.monitored
  });
}
```

- [ ] **Step 2: Change the guard condition**

Replace:
```ts
if (config.monitored !== undefined) {
```

With:
```ts
if (config.monitored === true) {
```

No other lines in this block change.

- [ ] **Step 3: Verify the build compiles cleanly**

Run from the repo root:
```bash
npm run build
```

Expected: build completes with no TypeScript errors. If there are errors, they will be unrelated to this change (the type of `config.monitored` is `boolean | undefined` in `CommonFilterConfig` and the condition `=== true` is valid for both).

- [ ] **Step 4: Start the dev server and manually verify the fix**

```bash
npm run dev
```

Open the Scoutarr UI, go to a Radarr (or any) instance config, and:

1. Set "Search Monitored Only" **OFF** (`monitored = false`), set "Missing Only" **ON**.
2. Trigger a manual search run.
3. Confirm that monitored movies with missing files appear in the search results (they previously were excluded).

Also verify the inverse still works:

4. Set "Search Monitored Only" **ON** (`monitored = true`).
5. Trigger a manual search run.
6. Confirm only monitored items are searched (existing behaviour preserved).

- [ ] **Step 5: Commit**

```bash
git add backend/src/utils/filterUtils.ts
git commit -m "fix: treat monitored=false as no-filter instead of unmonitored-only

The guard condition `config.monitored !== undefined` always evaluated
to true because the schema defines monitored as z.boolean() (never
undefined). With monitored=false, the filter kept only unmonitored
items — the opposite of the intended 'no restriction' behaviour.

Changing to `=== true` makes false mean 'include all items regardless
of monitored status', which matches the toggle semantics. Unattended
mode is fixed automatically as it delegates through the same filter path."
```
