# Media Library Status Filter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Status dropdown filter to the Media Library card's filter Popover, derived dynamically from the loaded media, applied client-side.

**Architecture:** Single file change — `MediaLibraryCard.tsx`. New `statusFilter` state, a `statusOptions` useMemo, a `formatStatus` helper, one new filter step in `gridRows`, an updated `filtersActive` boolean, and a new Select row in the Popover JSX.

**Tech Stack:** React 19, TypeScript strict, `@radix-ui/themes` (Select already imported)

---

## File Map

| File | Change |
|------|--------|
| `frontend/src/components/MediaLibraryCard.tsx` | All changes — state, memo, helper, filter step, UI |

---

### Task 1: Add `statusFilter` state and `statusOptions` memo

**Files:**
- Modify: `frontend/src/components/MediaLibraryCard.tsx` — lines ~329–333 (useState block) and ~line 340+ (after state declarations)

**Skills:** `shadcn` (Radix UI Themes patterns)

- [ ] **Load skills** — read `frontend/src/components/MediaLibraryCard.tsx` lines 325–345 to confirm exact insertion point after the other filter state declarations

- [ ] **Add `statusFilter` state** — insert after line ~329 (`const [showUpgradedOnly, setShowUpgradedOnly] = useState(false);`):

```typescript
const [statusFilter, setStatusFilter] = useState<string>('');
```

- [ ] **Add `statusOptions` useMemo** — insert immediately after the `statusFilter` state line:

```typescript
const statusOptions = useMemo(
  () => [...new Set((mediaData?.media ?? []).map(m => m.status))].filter(Boolean).sort(),
  [mediaData?.media]
);
```

- [ ] **Add `useEffect` to reset `statusFilter` on media change** — insert after the `statusOptions` useMemo:

```typescript
useEffect(() => {
  setStatusFilter('');
}, [mediaData?.media]);
```

This ensures that when the user switches to a different instance, a stale status value does not silently filter out all rows.

- [ ] **Add `formatStatus` helper** — insert as a module-level pure function near the top of the file (before the component function, with the other helper functions). Find the location by reading lines 1–80 to identify where helpers like `isUpgraded` live, then insert:

```typescript
function formatStatus(raw: string): string {
  const known: Record<string, string> = {
    inCinemas: 'In Cinemas',
    released: 'Released',
    continuing: 'Continuing',
    ended: 'Ended',
    upcoming: 'Upcoming',
    announced: 'Announced',
  };
  if (known[raw]) return known[raw];
  return raw.replace(/([A-Z])/g, ' $1').trim().replace(/\b\w/g, c => c.toUpperCase());
}
```

- [ ] **Commit**

```bash
git add frontend/src/components/MediaLibraryCard.tsx
git commit -m "feat(media-library): add statusFilter state, statusOptions memo, formatStatus helper"
```

---

### Task 2: Apply status filter in `gridRows` pipeline

**Files:**
- Modify: `frontend/src/components/MediaLibraryCard.tsx` — lines ~607–610 (after `showUpgradedOnly` filter, line 608), and line 731 (dependency array)

- [ ] **Load context** — read lines 605–615 to see the exact `showUpgradedOnly` filter block and where to insert after it:

```typescript
    if (showUpgradedOnly) {
      filtered = filtered.filter(item => isUpgraded(item));
    }
    // ← insert here
```

- [ ] **Add status filter step** — insert immediately after the `showUpgradedOnly` block:

```typescript
    if (statusFilter) {
      filtered = filtered.filter(item => item.status === statusFilter);
    }
```

- [ ] **Add `statusFilter` to dependency array** — at line 731, the current dep array ends with `showUpgradedOnly]`. Append `statusFilter`:

Before:
```typescript
  }, [mediaData?.media, sortColumns, columnFilters, isSonarr, episodeMode, hideSpecials, showMissingOnly, showMonitoredOnly, showUpgradedOnly]);
```

After:
```typescript
  }, [mediaData?.media, sortColumns, columnFilters, isSonarr, episodeMode, hideSpecials, showMissingOnly, showMonitoredOnly, showUpgradedOnly, statusFilter]);
```

- [ ] **Commit**

```bash
git add frontend/src/components/MediaLibraryCard.tsx
git commit -m "feat(media-library): apply statusFilter in gridRows pipeline"
```

---

### Task 3: Update `filtersActive` and add Status row to Popover JSX

**Files:**
- Modify: `frontend/src/components/MediaLibraryCard.tsx` — line ~1085 (`filtersActive`) and lines ~1095–1125 (Popover content)

- [ ] **Load context** — read lines 1083–1130 to see the `filtersActive` declaration and the Popover content JSX

- [ ] **Update `filtersActive`** — at line ~1085, append `|| statusFilter !== ''`:

Before:
```typescript
const filtersActive = showMonitoredOnly || showMissingOnly || showUpgradedOnly || (isSonarr && episodeMode);
```

After:
```typescript
const filtersActive = showMonitoredOnly || showMissingOnly || showUpgradedOnly || (isSonarr && episodeMode) || statusFilter !== '';
```

- [ ] **Add Status row to Popover** — insert after the "Upgraded Only" row (after the `</Flex>` that closes the Upgraded Only row, before the `{isSonarr && ...}` block):

```tsx
<Flex align="center" justify="between" gap="4">
  <Text size="2">Status</Text>
  <Select.Root size="1" value={statusFilter} onValueChange={setStatusFilter}>
    <Select.Trigger style={{ minWidth: '110px' }} />
    <Select.Content position="popper" sideOffset={5}>
      <Select.Item value="">Any Status</Select.Item>
      {statusOptions.map(s => (
        <Select.Item key={s} value={s}>{formatStatus(s)}</Select.Item>
      ))}
    </Select.Content>
  </Select.Root>
</Flex>
```

- [ ] **Commit**

```bash
git add frontend/src/components/MediaLibraryCard.tsx
git commit -m "feat(media-library): add Status filter to Popover, update filtersActive indicator"
```

---

### Task 4: Verify

- [ ] **Check for TypeScript errors** — run the editor's TypeScript checker or inspect the Problems panel. Expect zero errors in `MediaLibraryCard.tsx`.

- [ ] **Manual smoke test** — open the Dashboard, navigate to a Radarr instance's media library, open the filter Popover, confirm:
  - "Status" row appears below "Upgraded Only"
  - Dropdown shows "Any Status" plus the real status values from that instance (e.g. "Released", "In Cinemas", "Announced")
  - Selecting a status value filters the grid rows correctly
  - Selecting "Any Status" restores all rows
  - The filter Popover button shows active-state color when a status is selected

- [ ] **Final commit** (if any fixup needed, otherwise skip)
