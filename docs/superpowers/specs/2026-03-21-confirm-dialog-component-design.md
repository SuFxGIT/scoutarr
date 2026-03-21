# ConfirmDialog Component — Design Spec

**Date:** 2026-03-21  
**Scope:** Frontend only  
**Type:** Refactor — UI consistency, no behaviour change

---

## Overview

Four places in the app use an inline ternary pattern to show a destructive confirmation:

1. **Delete instance** (`InstanceCard.tsx`) — trash button toggles into inline Yes/Cancel
2. **Clear tags** (`InstanceCard.tsx`) — "Clear Tags" button toggles into inline Confirm/Cancel
3. **Clear statistics** (`Settings.tsx`) — "Clear Statistics" button toggles into inline Confirm Clear/Cancel
4. **Reset app** (`Settings.tsx`) — "Reset App" button toggles into inline Confirm Reset/Cancel

The project already uses `AlertDialog` from `@radix-ui/themes` correctly in two places (unsaved changes in `Settings.tsx`, Sonarr tag warning and search conflicts in `MediaLibraryCard.tsx`). The four cases above are inconsistent with this established pattern.

The fix is to extract a shared `ConfirmDialog` component — a thin `AlertDialog` wrapper — and migrate all four call sites to use it.

---

## New Component: `frontend/src/components/ConfirmDialog.tsx`

### Interface

```ts
type ConfirmDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel: string;
  onConfirm: () => void;
  isPending?: boolean;
};
```

### Structure

- `AlertDialog.Root` controlled via `open` / `onOpenChange`
- No `AlertDialog.Trigger` — callers own the trigger button
- `AlertDialog.Content` with `maxWidth="450px"` (matching existing usage)
- `AlertDialog.Title` — renders `title`
- `AlertDialog.Description` — renders `description`
- `Flex gap="3" justify="end"` footer with:
  - `AlertDialog.Cancel` wrapping a gray soft `Button` ("Cancel"), `disabled={isPending}`
  - `AlertDialog.Action` wrapping a red solid `Button` (`confirmLabel`), `disabled={isPending}`

---

## Changes to `InstanceCard.tsx`

> **State ownership context:** Currently, the two confirmation states (`confirmingDeleteInstance` and `confirmingClearTags`) live in `Settings.tsx` and are passed down to every `InstanceCard` instance as four props. This was necessary because only one confirmation can be active across all cards at once. After this refactor, each `InstanceCard` manages its own local open/close boolean — the mutual-exclusion requirement is dropped in favour of native `AlertDialog` modal behaviour (only one modal can be open at a time anyway).

### New import

```ts
import { ConfirmDialog } from './ConfirmDialog';
```

(Also add `useState` to the React import.)

### Props removed

Four props are removed from `InstanceCardProps` (and the destructure):
- `confirmingDeleteId: string | null`
- `setConfirmingDeleteId: (id: string | null) => void`
- `confirmingClearTags: string | null`
- `setConfirmingClearTags: (id: string | null) => void`

### Local state added

```ts
const [deleteOpen, setDeleteOpen] = useState(false);
const [clearTagsOpen, setClearTagsOpen] = useState(false);
```

### Delete instance

- Trash button always renders (no ternary): `variant="soft" color="red" size="1"`. Clicking it calls `setDeleteOpen(true)`.
- `e.stopPropagation()` retained **only on the trash button click handler** — needed to prevent the Collapsible from toggling. The `ConfirmDialog` renders as a modal overlay outside the Collapsible tree; its internal Cancel and Confirm buttons do NOT need `stopPropagation()`.
- `<ConfirmDialog>` rendered immediately after the `<Tooltip>` + trash button block (same flex row level):
  - `open={deleteOpen} onOpenChange={setDeleteOpen}`
  - `title="Delete instance?"`
  - `description="This cannot be undone."`
  - `confirmLabel="Delete"`
  - `onConfirm={() => onRemove(appType, instance.id)}`

### Clear tags

- "Clear Tags" button always renders (no ternary): `variant="outline" color="red" size="2"`. Clicking it calls `setClearTagsOpen(true)`.
- `<ConfirmDialog>` rendered adjacent to the Clear Tags button:
  - `open={clearTagsOpen} onOpenChange={setClearTagsOpen}`
  - `title="Clear Tags?"`
  - `description={\`Removes the configured tag from all ${appInfo.mediaTypePlural.toLowerCase()} in this ${appInfo.name} instance.\`}`
  - `confirmLabel="Clear Tags"`
  - `onConfirm={() => onClearTags(appType, instance.id)}`
  - `isPending={clearTagsPending}` *(existing prop, already part of `InstanceCardProps`)*

---

## Changes to `Settings.tsx`

### State vars removed

Four state vars that were centralised in `Settings.tsx` and passed down to `InstanceCard` are deleted — their responsibilities move to local state inside `InstanceCard` itself:

- `const [confirmingDeleteInstance, setConfirmingDeleteInstance] = useState<string | null>(null)`
- `const [confirmingClearTags, setConfirmingClearTags] = useState<string | null>(null)`
- `setConfirmingDeleteInstance(null)` call inside `removeInstance` — removed
- `setConfirmingClearTags(null)` calls inside `clearTagsMutation` `onSuccess`/`onError` — removed

### Props removed from `InstanceCard` JSX

`InstanceCard` is rendered inside a `instances.map(...)` loop in the Applications tab of `Settings.tsx`. Each rendered instance receives the same 4 props that are now gone:
- `confirmingDeleteId`, `setConfirmingDeleteId`, `confirmingClearTags`, `setConfirmingClearTags` — remove from the JSX spread at the render site.

### Clear Statistics

Replace inline ternary with `<ConfirmDialog>` controlled by existing `confirmingClearData` state. The `ConfirmDialog` is rendered after the trigger button inside the same `Flex direction="column" gap="2"` section wrapper:
- `open={confirmingClearData} onOpenChange={setConfirmingClearData}`
- `title="Clear Statistics?"`
- `description="Delete all search history and CF score history. This resets statistics to zero but keeps configuration, instances, and media library intact."` *(note: description text is condensed vs. the current inline UI; the full explanation remains in the descriptive `<Text>` above the button)*
- `confirmLabel="Clear Statistics"`
- `onConfirm={() => clearDataMutation.mutate()}`
- `isPending={clearDataMutation.isPending}`
- Trigger button: `variant="outline" color="red" size="2"` "Clear Statistics" (always rendered — no more ternary)

### Reset App

Replace inline ternary with `<ConfirmDialog>` controlled by existing `confirmingResetApp` state. The `ConfirmDialog` is rendered after the trigger button inside the same `Flex direction="column" gap="2"` section wrapper:
- `open={confirmingResetApp} onOpenChange={setConfirmingResetApp}`
- `title="Reset App?"`
- `description="This will permanently delete all configuration, databases, log files, and clear browser storage. The app will reload automatically. This action cannot be undone."` *(note: condensed from the current warning text; the full explanation remains in the descriptive `<Text>` above the button)*
- `confirmLabel="Reset App"`
- `onConfirm={() => resetAppMutation.mutate()}`
- `isPending={resetAppMutation.isPending}`
- Trigger button: `variant="solid" color="red" size="2"` "Reset App" (always rendered — no more ternary)

---

## What Stays the Same

- The existing `AlertDialog` usages in `MediaLibraryCard.tsx` (Sonarr tag warning, search conflicts) are left untouched — they have rich contextual content and do not fit the simple yes/no destructive pattern.
- The existing `AlertDialog` unsaved-changes dialog in `Settings.tsx` is left untouched — it has a different semantic (cancel navigation vs. destructive action).
- No backend changes.
- No behaviour change — the same mutations, callbacks, and toast messages fire exactly as before.

---

## File Summary

| File | Change type |
|------|-------------|
| `frontend/src/components/ConfirmDialog.tsx` | **New file** |
| `frontend/src/components/InstanceCard.tsx` | Remove 4 props; add 2 local state vars; replace 2 inline ternaries with `ConfirmDialog` |
| `frontend/src/pages/Settings.tsx` | Remove 2 state vars + cleanup; replace 2 inline ternaries with `ConfirmDialog`; remove 4 props from `InstanceCard` render |
