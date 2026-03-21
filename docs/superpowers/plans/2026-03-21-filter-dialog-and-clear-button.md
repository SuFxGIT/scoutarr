# Filter Dialog & Clear Button Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the "Apply Filters" Popover in the Media Library dashboard with a Radix UI Themes Dialog and add a "Clear" button inside it to reset all popup-layer filters at once.

**Architecture:** Single file change in `MediaLibraryCard.tsx` — swap `Popover` for a manually-controlled `Dialog.Root`, add `filterDialogOpen` state, add a `useEffect` to close the dialog when the selected instance changes, and add Clear/Done buttons in the dialog footer.

**Tech Stack:** React 19, TypeScript strict, Radix UI Themes (`Dialog`, `Button`, `Flex`, `Switch`, `Select`, `SegmentedControl`, `Separator`, `Text`)

---

## Files

- Modify: `frontend/src/components/MediaLibraryCard.tsx`

---

### Task 1: Add `Dialog` import and remove `Popover`

**Skills:** `shadcn`

**Files:**
- Modify: `frontend/src/components/MediaLibraryCard.tsx` (lines 6–25 — the `@radix-ui/themes` import block)

- [ ] **Load skills** — read `/mnt/user/other/projects/scoutarr/.agents/skills/shadcn/SKILL.md` in full.

- [ ] **Step 1: Update the import**

In `frontend/src/components/MediaLibraryCard.tsx`, find the `@radix-ui/themes` named import block (currently includes `Popover` on its own line near the end). Replace `Popover` with `Dialog`:

```typescript
// Before (inside the @radix-ui/themes import):
  Popover,

// After:
  Dialog,
```

The full updated import block should look like:
```typescript
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
  Dialog,
} from '@radix-ui/themes';
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /mnt/user/other/projects/scoutarr
node node_modules/typescript/bin/tsc --project frontend/tsconfig.json --noEmit 2>&1
```

Expected: no errors (or only pre-existing errors unrelated to this change).

---

### Task 2: Add `filterDialogOpen` state

**Skills:** none

**Files:**
- Modify: `frontend/src/components/MediaLibraryCard.tsx` (near line 365 — filter state block)

- [ ] **Step 1: Add the new state**

After the existing `columnFilters` state (around line 365), add:

```typescript
  const [filterDialogOpen, setFilterDialogOpen] = useState(false);
```

Place it just after the `columnOrder` state and before the first auto-select `useEffect`, so it groups with the other filter/UI states.

- [ ] **Step 2: Add the useEffect to close dialog on instance change**

Immediately after the new `filterDialogOpen` state line, add:

```typescript
  // Close filter dialog when switching instances
  useEffect(() => {
    setFilterDialogOpen(false);
  }, [selectedInstance]);
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
node node_modules/typescript/bin/tsc --project frontend/tsconfig.json --noEmit 2>&1
```

Expected: no errors.

---

### Task 3: Replace the Popover with a Dialog

**Skills:** `shadcn`

**Files:**
- Modify: `frontend/src/components/MediaLibraryCard.tsx` (lines ~1114–1171 — the Popover block)

- [ ] **Load skills** — read `/mnt/user/other/projects/scoutarr/.agents/skills/shadcn/SKILL.md` in full (if not already loaded in this session).

- [ ] **Step 1: Locate the Popover block**

Find the section that currently reads (around line 1114):

```tsx
<Popover.Root>
  <Popover.Trigger>
    <Button
      size="2"
      variant="ghost"
      color={filtersActive ? 'blue' : 'gray'}
      radius="full"
      aria-label="Filters"
    >
      <MixerHorizontalIcon />
      Apply Filters
    </Button>
  </Popover.Trigger>
  <Popover.Content width="220px" align="end">
    <Flex direction="column" gap="3">
      ...all the filter controls...
    </Flex>
  </Popover.Content>
</Popover.Root>
```

- [ ] **Step 2: Replace with Dialog**

Replace the entire `<Popover.Root>…</Popover.Root>` block with:

```tsx
<>
  <Button
    size="2"
    variant="ghost"
    color={filtersActive ? 'blue' : 'gray'}
    radius="full"
    aria-label="Filters"
    onClick={() => setFilterDialogOpen(true)}
  >
    <MixerHorizontalIcon />
    Apply Filters
  </Button>

  <Dialog.Root open={filterDialogOpen} onOpenChange={setFilterDialogOpen}>
    <Dialog.Content maxWidth="320px">
      <Dialog.Title>Filters</Dialog.Title>

      <Flex direction="column" gap="3">
        <Flex align="center" justify="between" gap="4">
          <Text size="2">Monitored Only</Text>
          <Switch size="1" checked={showMonitoredOnly} onCheckedChange={setShowMonitoredOnly} />
        </Flex>
        <Flex align="center" justify="between" gap="4">
          <Text size="2">Missing Only</Text>
          <Switch size="1" checked={showMissingOnly} onCheckedChange={setShowMissingOnly} />
        </Flex>
        <Flex align="center" justify="between" gap="4">
          <Text size="2">Upgraded Only</Text>
          <Switch size="1" checked={showUpgradedOnly} onCheckedChange={setShowUpgradedOnly} />
        </Flex>
        <Flex align="center" justify="between" gap="4">
          <Text size="2">Status</Text>
          <Select.Root size="1" value={statusFilter} onValueChange={setStatusFilter}>
            <Select.Trigger style={{ minWidth: '110px' }} />
            <Select.Content position="popper" sideOffset={5}>
              <Select.Item value="all">Any Status</Select.Item>
              {statusOptions.map(s => (
                <Select.Item key={s} value={s}>{formatStatus(s)}</Select.Item>
              ))}
            </Select.Content>
          </Select.Root>
        </Flex>
        {isSonarr && (
          <>
            <Separator size="4" />
            <Flex direction="column" gap="2">
              <Text size="2">View Mode</Text>
              <SegmentedControl.Root
                size="1"
                value={episodeMode ? 'episodes' : 'series'}
                onValueChange={(value) => setEpisodeMode(value === 'episodes')}
              >
                <SegmentedControl.Item value="series">Series</SegmentedControl.Item>
                <SegmentedControl.Item value="episodes">Episodes</SegmentedControl.Item>
              </SegmentedControl.Root>
            </Flex>
          </>
        )}
      </Flex>

      <Flex mt="4" justify="between" align="center">
        {filtersActive && (
          <Button
            size="2"
            variant="ghost"
            color="red"
            onClick={() => {
              setShowMonitoredOnly(false);
              setShowMissingOnly(false);
              setShowUpgradedOnly(false);
              setStatusFilter('all');
              setEpisodeMode(false);
            }}
          >
            Clear
          </Button>
        )}
        <Dialog.Close asChild>
          <Button size="2" ml="auto">Done</Button>
        </Dialog.Close>
      </Flex>

    </Dialog.Content>
  </Dialog.Root>
</>
```

Note the wrapping `<>…</>` fragment — needed because the trigger button and dialog are siblings but must live inside a single JSX expression.

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd /mnt/user/other/projects/scoutarr
node node_modules/typescript/bin/tsc --project frontend/tsconfig.json --noEmit 2>&1
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/MediaLibraryCard.tsx
git commit -m "feat: replace filter popover with dialog and add clear button"
```

---

### Task 4: Manual smoke test

**Skills:** none

- [ ] **Step 1: Start dev server (if not already running)**

```bash
cd /mnt/user/other/projects/scoutarr
npm run dev:frontend
```

Or if using Docker dev:
```bash
docker compose -f docker-compose.dev.yml up
```

- [ ] **Step 2: Open the Media Library page and verify:**

1. "Apply Filters" button appears in the toolbar as before.
2. Clicking the button opens a **centered modal dialog** with title "Filters".
3. All filter controls are present: Monitored Only, Missing Only, Upgraded Only, Status dropdown. (Sonarr instances also show View Mode segment control.)
4. Toggling switches or changing the dropdown updates the grid **live** while the dialog stays open.
5. With no filters active: only the **Done** button appears in the footer.
6. With at least one filter active:
   - "Apply Filters" button turns **blue**.
   - "Clear" button appears in the dialog footer (left-aligned).
7. Clicking **Clear** resets all popup filters; the grid updates immediately; the "Clear" button disappears from the footer; the trigger button turns gray.
8. Clicking **Done** or pressing **Escape** or clicking the backdrop closes the dialog without resetting filters.
9. Switching to a different instance closes the dialog.

- [ ] **Step 3: If any issue found, fix before proceeding.**
