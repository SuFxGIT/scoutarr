# Recent Searches Instance Display Name — Design Spec

**Date:** 2026-03-21  
**Scope:** Frontend only — `Dashboard.tsx`  
**Type:** UX improvement — display only, no behaviour change

---

## Problem

Recent Searches currently combines both `search.application` and `search.instance` to form the label:

```ts
const appName = search.instance
  ? `${search.application} (${search.instance})`
  : search.application;
```

The stored `instance` value is the `config.name` field — the optional user nickname. When the user sets a nickname like `"Main Radarr"`, the label reads `"radarr (Main Radarr)"`, which is redundant and noisy. When no nickname is set, it reads `"radarr"` — which is also unformatted.

---

## Goal

Display a single, clean label per search entry:

| User nickname set | Instances count | Label shown |
|---|---|---|
| Yes (`"Main Radarr"`) | any | `"Main Radarr"` |
| No | 1 | `"Radarr"` (capitalised app type, no index) |
| No | 2+ | `"Radarr 1"`, `"Radarr 2"` (position matches config order) |

---

## Solution

**Frontend-only.** `Dashboard.tsx` already fetches `config` via `useQuery` to power `resolveInstanceId`. The same config data is used to derive the display name.

### New callback: `getInstanceDisplayName`

Add alongside `resolveInstanceId` and `resolveInstanceUrl`:

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
  // Fallback: can't resolve → just capitalise the app name
  return capitalize(appType);
}, [config]);
```

### In the render loop

`instanceId` is already computed on the line immediately **after** `appName`. Swap the order so `instanceId` is computed first, then `appName` uses `getInstanceDisplayName`:

```ts
// Before:
const appName = search.instance
  ? `${search.application} (${search.instance})`
  : search.application;
const itemsPreview = ...
const instanceId = resolveInstanceId(search.application, search.instance);

// After:
const instanceId = resolveInstanceId(search.application, search.instance);
const appName = getInstanceDisplayName(search.application, instanceId);
const itemsPreview = ...
```

### Import

`capitalize` is already used elsewhere in the project from `es-toolkit`. Add it to the Dashboard import:
```ts
import { capitalize } from 'es-toolkit';
```

---

## What Stays the Same

- `resolveInstanceId` logic is unchanged — it still matches `instance` (the stored nickname) to `config.name` to resolve the instance ID.
- `resolveInstanceUrl` is unchanged.
- No backend changes.
- No changes to stored history data.
- `instanceId` resolution for CF history links and *arr URL links is unaffected.

---

## File Summary

| File | Change |
|---|---|
| `frontend/src/pages/Dashboard.tsx` | Add `capitalize` import; add `getInstanceDisplayName` callback; reorder + replace `appName` computation in render loop |
