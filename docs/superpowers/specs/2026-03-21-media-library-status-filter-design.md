# Media Library Status Filter — Design Spec

**Date:** 2026-03-21  
**Feature:** Add a Status filter dropdown to the Media Library card filter Popover in the Dashboard

---

## Overview

Add a single-select Status filter to `MediaLibraryCard`. The filter lives inside the existing filter Popover (alongside Monitored Only, Missing Only, Upgraded Only switches). Options are derived dynamically from the loaded media. All filtering remains client-side.

---

## State

One new piece of state in `MediaLibraryCard`:

```ts
const [statusFilter, setStatusFilter] = useState<string>('');
```

Empty string means "no filter / any status".

When the loaded `media` prop changes (user switches instance tab), `statusFilter` resets to `''`:

```ts
useEffect(() => {
  setStatusFilter('');
}, [media]);
```

---

## Derived Status Options

A `useMemo` over `media` produces sorted, deduplicated raw status values:

```ts
const statusOptions = useMemo(
  () => [...new Set(media.map(m => m.status))].filter(Boolean).sort(),
  [media]
);
```

---

## Display Name Prettifier

A pure function `formatStatus(raw: string): string` caps each camelCase word and handles known mappings:

| Raw API value | Display label |
|---|---|
| `inCinemas` | In Cinemas |
| `released` | Released |
| `continuing` | Continuing |
| `ended` | Ended |
| `upcoming` | Upcoming |
| `announced` | Announced |
| anything else | Split camelCase, capitalize each word |

Fallback: `raw.replace(/([A-Z])/g, ' $1').trim()` then `capitalize` each word.

---

## Filter Application

Added to the existing client-side filter pipeline `useMemo` that builds `displayRows`, after the Missing Only step:

```ts
if (statusFilter) {
  filtered = filtered.filter(m => m.status === statusFilter);
}
```

---

## UI — Filter Popover

New row added below the "Upgraded Only" row inside the Popover:

```
Status   [Any Status ▼]
```

- Label: `<Text size="1">Status</Text>` — matches existing switch-row label style
- Control: `<Select.Root size="1" value={statusFilter} onValueChange={setStatusFilter}>` with:
  - First item: `<Select.Item value="">Any Status</Select.Item>`
  - Dynamic items: `statusOptions.map(s => <Select.Item key={s} value={s}>{formatStatus(s)}</Select.Item>)`
- The row uses the same `Flex direction="row" align="center" justify="between"` layout as the switch rows

---

## Active Filter Indicator

The Popover trigger button uses a conditional color/variant to indicate an active filter. The `statusFilter !== ''` condition is added to the existing active-filter boolean alongside `showMonitoredOnly`, `showMissingOnly`, `showUpgradedOnly`.

---

## Scope

- **Only file changed:** `frontend/src/components/MediaLibraryCard.tsx`
- No backend changes — all filtering is already client-side
- No new shared types needed — `status` is already on the media interface
- No persistence — status filter is session-only (resets on instance switch and page reload), consistent with the existing switch filters

---

## Non-Goals

- No multi-select
- No persistence to localStorage
- No backend query param
- No hardcoded per-app option lists
