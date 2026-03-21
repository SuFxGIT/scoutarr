# Monitored Filter Bug Fix — Design Spec

**Date:** 2026-03-21
**Status:** Approved

---

## Overview

Fix a bug where setting "Search Monitored Only" to **disabled** (`false`) incorrectly filters search candidates to **unmonitored** items only, instead of applying no monitored filter at all.

---

## Root Cause

`filterUtils.ts:54` guards the monitored filter with:

```ts
if (config.monitored !== undefined)
```

All four instance schemas define `monitored: z.boolean()` (non-optional), so the value is always `true` or `false` — never `undefined`. The condition is therefore always `true`, and the filter always runs:

- `monitored = true` → keeps only monitored items ✅
- `monitored = false` → keeps only **unmonitored** items ❌ (should be no filter)

---

## Fix

**File:** `backend/src/utils/filterUtils.ts`
**Line:** 54

```ts
// Before
if (config.monitored !== undefined) {

// After
if (config.monitored === true) {
```

`false` now means "no restriction on monitored status — include all items". `true` retains the existing "monitored items only" behaviour.

---

## Scope

### What changes

| File | Change |
|------|--------|
| `backend/src/utils/filterUtils.ts` | Line 54: change `!== undefined` to `=== true` |

### What does NOT change

- **Schema** — `monitored: z.boolean()` stays non-optional. `false` is a valid, meaningful value ("no filter"). No migration needed.
- **Unattended mode** — already delegates to `processor.filterMedia(processor.config, tempAllMedia)`, which calls `applyCommonFilters`. Fixing the condition automatically fixes unattended mode's tag-clearing scope with no further changes.
- **`statsService.getMediaFromDatabase`** — uses `filters?.monitored !== undefined` as a DB query builder with an optional argument. Called without filters in all current call sites. Unaffected.
- **Frontend** — the toggle already stores `true`/`false` correctly. No UI change needed.

---

## Behaviour After Fix

| Toggle state | `monitored` value | Filter applied |
|---|---|---|
| ON | `true` | Monitored items only |
| OFF | `false` | No filter — all items included |

Unattended mode tag-clearing uses the same filter path and benefits automatically.
