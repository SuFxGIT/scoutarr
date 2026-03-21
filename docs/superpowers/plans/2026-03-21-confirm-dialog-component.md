# ConfirmDialog Component Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace four inline ternary confirmation patterns with a shared `ConfirmDialog` component backed by Radix UI `AlertDialog`.

**Architecture:** Create `ConfirmDialog.tsx` as a thin `AlertDialog` wrapper with controlled open state. Migrate `InstanceCard.tsx` to manage its own local boolean state (removing 4 parent-passed props). Migrate the two confirmations in `Settings.tsx` Advanced tab to use `ConfirmDialog` in place of inline ternaries.

**Tech Stack:** React 19, TypeScript 5 strict, `@radix-ui/themes` (`AlertDialog`, `Button`, `Flex`)

**Spec:** `docs/superpowers/specs/2026-03-21-confirm-dialog-component-design.md`

---

### Task 1: Create `ConfirmDialog.tsx`

**Files:**
- Create: `frontend/src/components/ConfirmDialog.tsx`

- [ ] **Step 1: Create the file**

```tsx
import { AlertDialog, Button, Flex } from '@radix-ui/themes';

type ConfirmDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel: string;
  onConfirm: () => void;
  isPending?: boolean;
};

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  onConfirm,
  isPending,
}: ConfirmDialogProps) {
  return (
    <AlertDialog.Root open={open} onOpenChange={onOpenChange}>
      <AlertDialog.Content maxWidth="450px">
        <AlertDialog.Title>{title}</AlertDialog.Title>
        <AlertDialog.Description size="3" mb="4">
          {description}
        </AlertDialog.Description>
        <Flex gap="3" justify="end">
          <AlertDialog.Cancel>
            <Button variant="soft" color="gray" disabled={isPending}>
              Cancel
            </Button>
          </AlertDialog.Cancel>
          <AlertDialog.Action>
            <Button variant="solid" color="red" onClick={onConfirm} disabled={isPending}>
              {confirmLabel}
            </Button>
          </AlertDialog.Action>
        </Flex>
      </AlertDialog.Content>
    </AlertDialog.Root>
  );
}
```

- [ ] **Step 2: TypeScript check**

Run: `node node_modules/typescript/bin/tsc --project frontend/tsconfig.json --noEmit 2>&1`

Expected: no errors for `ConfirmDialog.tsx`

---

### Task 2: Refactor `InstanceCard.tsx`

**Files:**
- Modify: `frontend/src/components/InstanceCard.tsx`

Context: Four props (`confirmingDeleteId`, `setConfirmingDeleteId`, `confirmingClearTags`, `setConfirmingClearTags`) are currently owned by `Settings.tsx` and passed down. They are replaced by two local booleans inside `InstanceCard`.

- [ ] **Step 1: Update imports at the top of the file**

Replace:
```tsx
import React from 'react';
import { Card, Flex, Text, Tooltip, TextField, Switch, Select, Separator, Button } from '@radix-ui/themes';
```

With:
```tsx
import React, { useState } from 'react';
import { Card, Flex, Text, Tooltip, TextField, Switch, Select, Separator, Button } from '@radix-ui/themes';
import { ConfirmDialog } from './ConfirmDialog';
```

- [ ] **Step 2: Remove the 4 props from `InstanceCardProps`**

Remove these four lines from the type definition:
```ts
  confirmingDeleteId: string | null;
  setConfirmingDeleteId: (id: string | null) => void;
  confirmingClearTags: string | null;
  setConfirmingClearTags: (id: string | null) => void;
```

- [ ] **Step 3: Remove the 4 props from the function destructure**

Remove `confirmingDeleteId`, `setConfirmingDeleteId`, `confirmingClearTags`, `setConfirmingClearTags` from the destructure parameter list.

- [ ] **Step 4: Add local state inside the function body**

After the `const instanceKey = ...` line, add:
```ts
const [deleteOpen, setDeleteOpen] = useState(false);
const [clearTagsOpen, setClearTagsOpen] = useState(false);
```

- [ ] **Step 5: Replace the delete confirmation ternary**

Find this block (inside the collapsible trigger header `<Flex align="center" gap="2">`):
```tsx
                  {confirmingDeleteId === instanceKey ? (
                    <Flex gap="1" align="center">
                      <Text size="1" color="gray">Delete?</Text>
                      <Button
                        variant="solid"
                        color="red"
                        size="1"
                        onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
                          e.stopPropagation();
                          onRemove(appType, instance.id);
                        }}
                      >
                        Yes
                      </Button>
                      <Button
                        variant="outline"
                        size="1"
                        onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
                          e.stopPropagation();
                          setConfirmingDeleteId(null);
                        }}
                      >
                        Cancel
                      </Button>
                    </Flex>
                  ) : (
                    <Tooltip content="Delete this instance">
                      <Button
                        variant="soft"
                        color="red"
                        size="1"
                        onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
                          e.stopPropagation();
                          setConfirmingDeleteId(instanceKey);
                        }}
                      >
                        <TrashIcon />
                      </Button>
                    </Tooltip>
                  )}
```

Replace with:
```tsx
                  <Tooltip content="Delete this instance">
                    <Button
                      variant="soft"
                      color="red"
                      size="1"
                      onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
                        e.stopPropagation();
                        setDeleteOpen(true);
                      }}
                    >
                      <TrashIcon />
                    </Button>
                  </Tooltip>
                  <ConfirmDialog
                    open={deleteOpen}
                    onOpenChange={setDeleteOpen}
                    title="Delete instance?"
                    description="This cannot be undone."
                    confirmLabel="Delete"
                    onConfirm={() => onRemove(appType, instance.id)}
                  />
```

- [ ] **Step 6: Replace the clear tags confirmation ternary**

Find this block (inside `<Collapsible.Content>`):
```tsx
                {confirmingClearTags === instanceKey ? (
                  <Flex gap="2" align="center">
                    <Text size="1" color="gray">Confirm?</Text>
                    <Button
                      variant="solid"
                      size="2"
                      color="red"
                      onClick={() => onClearTags(appType, instance.id)}
                      disabled={clearTagsPending}
                    >
                      {clearTagsPending ? 'Clearing...' : 'Confirm'}
                    </Button>
                    <Button
                      variant="outline"
                      size="2"
                      onClick={() => setConfirmingClearTags(null)}
                      disabled={clearTagsPending}
                    >
                      Cancel
                    </Button>
                  </Flex>
                ) : (
                  <Tooltip content={`Removes the configured tag from all ${appInfo.mediaTypePlural.toLowerCase()} in this ${appInfo.name} instance. This is useful for resetting the upgrade process or clearing tags from all media at once.`}>
                    <Button
                      variant="outline"
                      size="2"
                      color="red"
                      onClick={() => setConfirmingClearTags(instanceKey)}
                    >
                      Clear Tags
                    </Button>
                  </Tooltip>
                )}
```

Replace with:
```tsx
                <Button
                  variant="outline"
                  size="2"
                  color="red"
                  onClick={() => setClearTagsOpen(true)}
                >
                  Clear Tags
                </Button>
                <ConfirmDialog
                  open={clearTagsOpen}
                  onOpenChange={setClearTagsOpen}
                  title="Clear Tags?"
                  description={`Removes the configured tag from all ${appInfo.mediaTypePlural.toLowerCase()} in this ${appInfo.name} instance.`}
                  confirmLabel="Clear Tags"
                  onConfirm={() => onClearTags(appType, instance.id)}
                  isPending={clearTagsPending}
                />
```

- [ ] **Step 7: TypeScript check**

Run: `node node_modules/typescript/bin/tsc --project frontend/tsconfig.json --noEmit 2>&1`

Expected: no errors

---

### Task 3: Refactor `Settings.tsx`

**Files:**
- Modify: `frontend/src/pages/Settings.tsx`

- [ ] **Step 1: Add `ConfirmDialog` import**

`AlertDialog` is already imported. Add `ConfirmDialog` to the component imports. After the existing component import block, add:
```tsx
import { ConfirmDialog } from '../components/ConfirmDialog';
```

- [ ] **Step 2: Remove the two state variable declarations**

Remove these two lines (around line 59–60):
```ts
  const [confirmingClearTags, setConfirmingClearTags] = useState<string | null>(null);
  const [confirmingDeleteInstance, setConfirmingDeleteInstance] = useState<string | null>(null);
```

- [ ] **Step 3: Remove `setConfirmingDeleteInstance(null)` from `removeInstance`**

Inside the `removeInstance` function body, find and remove:
```ts
    setConfirmingDeleteInstance(null);
```

- [ ] **Step 4: Remove `setConfirmingClearTags(null)` from clearTagsMutation callbacks**

Inside `clearTagsMutation`, remove `setConfirmingClearTags(null)` from both `onSuccess` and `onError`.

- [ ] **Step 5: Remove the 4 props from the `InstanceCard` JSX render**

Inside the `instances.map(...)` loop in the Applications tab, remove these four props from the `<InstanceCard>` element:
```tsx
                        confirmingDeleteId={confirmingDeleteInstance}
                        setConfirmingDeleteId={setConfirmingDeleteInstance}
                        confirmingClearTags={confirmingClearTags}
                        setConfirmingClearTags={setConfirmingClearTags}
```

- [ ] **Step 6: Replace the Clear Statistics inline ternary**

Find the entire `{confirmingClearData ? ( ... ) : ( ... )}` block in the "Clear Statistics" section and replace with:

```tsx
                  <Button
                    variant="outline"
                    color="red"
                    size="2"
                    onClick={() => setConfirmingClearData(true)}
                    disabled={clearDataMutation.isPending}
                  >
                    Clear Statistics
                  </Button>
                  <ConfirmDialog
                    open={confirmingClearData}
                    onOpenChange={setConfirmingClearData}
                    title="Clear Statistics?"
                    description="Delete all search history and CF score history. This resets statistics to zero but keeps configuration, instances, and media library intact."
                    confirmLabel="Clear Statistics"
                    onConfirm={() => clearDataMutation.mutate()}
                    isPending={clearDataMutation.isPending}
                  />
```

- [ ] **Step 7: Replace the Reset App inline ternary**

Find the entire `{confirmingResetApp ? ( ... ) : ( ... )}` block in the "Reset App" section and replace with:

```tsx
                  <Button
                    variant="solid"
                    color="red"
                    size="2"
                    onClick={() => setConfirmingResetApp(true)}
                    disabled={resetAppMutation.isPending}
                  >
                    Reset App
                  </Button>
                  <ConfirmDialog
                    open={confirmingResetApp}
                    onOpenChange={setConfirmingResetApp}
                    title="Reset App?"
                    description="This will permanently delete all configuration, databases, log files, and clear browser storage. The app will reload automatically. This action cannot be undone."
                    confirmLabel="Reset App"
                    onConfirm={() => resetAppMutation.mutate()}
                    isPending={resetAppMutation.isPending}
                  />
```

- [ ] **Step 8: TypeScript check — all packages**

Run:
```bash
node node_modules/typescript/bin/tsc --project shared/tsconfig.json --noEmit 2>&1 && \
node node_modules/typescript/bin/tsc --project backend/tsconfig.json --noEmit 2>&1 && \
node node_modules/typescript/bin/tsc --project frontend/tsconfig.json --noEmit 2>&1 && \
echo ALL OK
```

Expected: `ALL OK`

- [ ] **Step 9: Commit**

```bash
git add frontend/src/components/ConfirmDialog.tsx \
        frontend/src/components/InstanceCard.tsx \
        frontend/src/pages/Settings.tsx
git commit -m "refactor: replace inline confirmation ternaries with ConfirmDialog AlertDialog

- Add shared ConfirmDialog component (thin AlertDialog wrapper)
- Remove 4 confirmation state props from InstanceCard; manage locally
- Replace delete instance and clear tags inline ternaries in InstanceCard
- Replace clear statistics and reset app inline ternaries in Settings
- No behaviour change — same mutations, callbacks, and toasts fire"
```
