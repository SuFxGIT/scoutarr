# Recent Searches Display Name Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the noisy `"radarr (Main Radarr)"` label in Recent Searches with a single clean display name using the user's nickname or a capitalized fallback.

**Architecture:** Frontend-only change in `Dashboard.tsx`. A new `getInstanceDisplayName` callback uses the already-fetched `config` data (same data used by `resolveInstanceId`) to derive a clean label. No backend changes.

**Tech Stack:** React 19, TypeScript 5 strict, `es-toolkit` `capitalize`, `@tanstack/react-query`

---

## File Map

| File | Change |
|---|---|
| `frontend/src/pages/Dashboard.tsx` | Add `capitalize` import; add `getInstanceDisplayName` callback (line ~194); reorder + replace `appName` computation in render loop (lines ~521–529) |

---

### Task 1: Add `capitalize` import and `getInstanceDisplayName` callback

**Files:**
- Modify: `frontend/src/pages/Dashboard.tsx:29-36` (imports), `frontend/src/pages/Dashboard.tsx:184-196` (after `resolveInstanceUrl`)

- [ ] **Step 1: Add `capitalize` import**

In `frontend/src/pages/Dashboard.tsx`, add `capitalize` to the existing `es-toolkit` import (if none, add a new import line after the `buildArrUrl` import):

```ts
import { capitalize } from 'es-toolkit';
```

- [ ] **Step 2: Add `getInstanceDisplayName` callback**

After the `resolveInstanceUrl` callback (currently ending around line 196), insert:

```ts
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
```

---

### Task 2: Update render loop to use `getInstanceDisplayName`

**Files:**
- Modify: `frontend/src/pages/Dashboard.tsx:521-529`

- [ ] **Step 1: Reorder and replace `appName` computation**

In the `currentItems.map` render loop, swap the order so `instanceId` is computed first, then replace the `appName` ternary:

```ts
// Before (lines ~521-529):
const appName = search.instance
  ? `${search.application} (${search.instance})`
  : search.application;
const itemsPreview = search.items.length > 0
  ? search.items.slice(0, 3).map((i: { id: number; title: string }) => i.title).join(', ') +
    (search.items.length > 3 ? ` +${search.items.length - 3} more` : '')
  : 'No items';

const instanceId = resolveInstanceId(search.application, search.instance);

// After:
const instanceId = resolveInstanceId(search.application, search.instance);
const appName = getInstanceDisplayName(search.application, instanceId);
const itemsPreview = search.items.length > 0
  ? search.items.slice(0, 3).map((i: { id: number; title: string }) => i.title).join(', ') +
    (search.items.length > 3 ? ` +${search.items.length - 3} more` : '')
  : 'No items';
```

- [ ] **Step 2: TypeScript check**

Run:
```bash
docker exec scoutarr-dev sh -c "node /app/node_modules/typescript/bin/tsc --project /app/frontend/tsconfig.json --noEmit 2>&1"
```

Expected: only the pre-existing `MediaLibraryCard.tsx(1198,37)` error (unrelated); no new errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/Dashboard.tsx
git commit -m "feat: show clean display name in recent searches"
```
