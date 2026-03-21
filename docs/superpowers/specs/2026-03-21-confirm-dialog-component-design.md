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

- Trash button always renders (no ternary). Clicking it calls `setDeleteOpen(true)`.
- `e.stopPropagation()` retained on the button click — needed to prevent the collapsible from toggling.
- `<ConfirmDialog>` placed after the `<Tooltip>` block:
  - `title="Delete instance?"`
  - `description="This cannot be undone."`
  - `confirmLabel="Delete"`
  - `onConfirm={() => onRemove(appType, instance.id)}`

### Clear tags

- "Clear Tags" button always renders (no ternary). Clicking it calls `setClearTagsOpen(true)`.
- `<ConfirmDialog>` placed adjacent:
  - `title="Clear Tags?"`
  - `description={\`Removes the configured tag from all ${appInfo.mediaTypePlural.toLowerCase()} in this ${appInfo.name} instance.\`}`
  - `confirmLabel="Clear Tags"`
  - `onConfirm={() => onClearTags(appType, instance.id)}`
  - `isPending={clearTagsPending}`

---

## Changes to `Settings.tsx`

### State vars removed

- `confirmingDeleteInstance` / `setConfirmingDeleteInstance` — deleted entirely
- `confirmingClearTags` / `setConfirmingClearTags` — deleted entirely
- `setConfirmingDeleteInstance(null)` call inside `removeInstance` — removed
- `setConfirmingClearTags(null)` calls inside `clearTagsMutation` `onSuccess`/`onError` — removed

### Props removed from `InstanceCard` JSX

- `confirmingDeleteId`, `setConfirmingDeleteId`, `confirmingClearTags`, `setConfirmingClearTags` — removed from all render sites

### Clear Statistics

Replace inline ternary with `<ConfirmDialog>` controlled by existing `confirmingClearData` state:
- `title="Clear Statistics?"`
- `description="Delete all search history and CF score history. This resets statistics to zero but keeps configuration, instances, and media library intact."`
- `confirmLabel="Clear Statistics"`
- `onConfirm={() => clearDataMutation.mutate()}`
- `isPending={clearDataMutation.isPending}`
- Trigger button: `variant="outline" color="red"` "Clear Statistics" (always rendered — no more ternary)

### Reset App

Replace inline ternary with `<ConfirmDialog>` controlled by existing `confirmingResetApp` state:
- `title="Reset App?"`
- `description="This will permanently delete all configuration, databases, log files, and clear browser storage. The app will reload automatically. This action cannot be undone."`
- `confirmLabel="Reset App"`
- `onConfirm={() => resetAppMutation.mutate()}`
- `isPending={resetAppMutation.isPending}`
- Trigger button: `variant="solid" color="red"` "Reset App" (always rendered — no more ternary)

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
