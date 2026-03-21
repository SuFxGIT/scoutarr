# Radix Toast + Collapsible/Tab Animations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace sonner with `@radix-ui/react-toast` (bottom-right, soft-style, dark/light safe), and add slide animations to the Settings collapsible and fade animations to the Settings tabs.

**Architecture:** Event-emitter pattern in `toast.ts` decouples call sites from the renderer. A new `Toaster.tsx` component subscribes at mount. Animations are pure CSS keyframes targeting Radix `data-state` attributes — no JS animation libraries needed.

**Tech Stack:** `@radix-ui/react-toast`, `@radix-ui/themes` (Flex, Text), `@radix-ui/react-icons` (CheckIcon, Cross2Icon), plain CSS keyframes in `index.css`.

**Skills:** `shadcn`, `nodejs-backend-patterns` (n/a here), `typescript-react-reviewer`

---

## File Map

| File | Change |
|---|---|
| `frontend/package.json` | Add `@radix-ui/react-toast`; remove `sonner` |
| `frontend/src/utils/toast.ts` | Rewrite as subscriber emitter |
| `frontend/src/components/Toaster.tsx` | New — Radix Toast renderer |
| `frontend/src/main.tsx` | Swap sonner `<Toaster>` for local `<Toaster>` |
| `frontend/src/pages/Settings.tsx` | Remove sonner import; 4× `toast.success` → `showSuccessToast` |
| `frontend/src/components/InstanceCard.tsx` | Add `className="collapsible-content"` to `Collapsible.Content` |
| `frontend/src/index.css` | Remove sonner CSS blocks; add 3 animation sets |

---

### Task 1: Swap package dependency

**Skills:** none

**Files:**
- Modify: `frontend/package.json`

- [ ] **Step 1: Update package.json**

In `frontend/package.json`, replace `"sonner": "^2.0.7"` with `"@radix-ui/react-toast": "^1.2.6"` in the `dependencies` object.

- [ ] **Step 2: Install in Docker container**

```bash
docker exec scoutarr-dev sh -c "cd /app/frontend && npm install 2>&1 | tail -5"
```

Expected: no errors; `@radix-ui/react-toast` installed.

---

### Task 2: Rewrite `toast.ts` as subscriber emitter

**Skills:** none

**Files:**
- Modify: `frontend/src/utils/toast.ts`

- [ ] **Step 1: Replace file content**

Replace the entire contents of `frontend/src/utils/toast.ts` with:

```ts
export type ToastItem = { id: string; variant: 'success' | 'error'; message: string };
type Listener = (item: ToastItem) => void;

const listeners = new Set<Listener>();

export function subscribe(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function emit(item: ToastItem): void {
  listeners.forEach(fn => fn(item));
}

export function showErrorToast(message: string): void {
  emit({ id: crypto.randomUUID(), variant: 'error', message });
}

export function showSuccessToast(message: string): void {
  emit({ id: crypto.randomUUID(), variant: 'success', message });
}
```

---

### Task 3: Create `Toaster.tsx`

**Skills:** `shadcn`

**Files:**
- Create: `frontend/src/components/Toaster.tsx`

- [ ] **Step 1: Create the file**

```tsx
import { useEffect, useState } from 'react';
import * as Toast from '@radix-ui/react-toast';
import { CheckIcon, Cross2Icon } from '@radix-ui/react-icons';
import { Flex, Text } from '@radix-ui/themes';
import { subscribe, type ToastItem } from '../utils/toast';

type ToastEntry = ToastItem & { open: boolean };

export function Toaster() {
  const [toasts, setToasts] = useState<ToastEntry[]>([]);

  useEffect(() => {
    return subscribe(item =>
      setToasts(prev => [...prev, { ...item, open: true }])
    );
  }, []);

  function dismiss(id: string) {
    setToasts(prev => prev.map(t => (t.id === id ? { ...t, open: false } : t)));
  }

  return (
    <Toast.Provider swipeDirection="right">
      {toasts.map(t => (
        <Toast.Root
          key={t.id}
          className="toast-item"
          open={t.open}
          onOpenChange={open => { if (!open) dismiss(t.id); }}
          duration={4000}
          style={{
            background: t.variant === 'success' ? 'var(--green-3)' : 'var(--red-3)',
            border: `1px solid ${t.variant === 'success' ? 'var(--green-9)' : 'var(--red-9)'}`,
            borderRadius: 'var(--radius-2)',
            padding: '8px 12px',
          }}
        >
          <Toast.Title asChild>
            <Flex align="center" gap="2">
              {t.variant === 'success'
                ? <CheckIcon style={{ color: 'var(--green-9)', flexShrink: 0 }} />
                : <Cross2Icon style={{ color: 'var(--red-9)', flexShrink: 0 }} />}
              <Text size="1" style={{ color: t.variant === 'success' ? 'var(--green-11)' : 'var(--red-11)' }}>
                {t.message}
              </Text>
            </Flex>
          </Toast.Title>
        </Toast.Root>
      ))}
      <Toast.Viewport
        style={{
          position: 'fixed',
          bottom: 16,
          right: 16,
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          width: 360,
          maxWidth: 'calc(100vw - 32px)',
          listStyle: 'none',
          padding: 0,
          margin: 0,
          zIndex: 2147483647,
          outline: 'none',
        }}
      />
    </Toast.Provider>
  );
}
```

---

### Task 4: Update `main.tsx`

**Skills:** none

**Files:**
- Modify: `frontend/src/main.tsx`

- [ ] **Step 1: Replace sonner Toaster with local Toaster**

Replace:
```tsx
import { Toaster } from 'sonner';
```
With:
```tsx
import { Toaster } from './components/Toaster';
```

Replace:
```tsx
      <Toaster position="top-center" />
```
With:
```tsx
      <Toaster />
```

---

### Task 5: Clean up `Settings.tsx`

**Skills:** none

**Files:**
- Modify: `frontend/src/pages/Settings.tsx`

- [ ] **Step 1: Remove sonner import**

Remove the line:
```ts
import { toast } from 'sonner';
```

- [ ] **Step 2: Replace 4 direct `toast.success` calls with `showSuccessToast`**

| Replace | With |
|---|---|
| `toast.success('Configuration saved successfully!')` | `showSuccessToast('Configuration saved successfully!')` |
| `toast.success('Search history and CF score history cleared')` | `showSuccessToast('Search history and CF score history cleared')` |
| `toast.success('App reset completed - all data cleared. Reloading...')` | `showSuccessToast('App reset completed - all data cleared. Reloading...')` |
| `` toast.success(`Connection test successful${versionText}`) `` | `` showSuccessToast(`Connection test successful${versionText}`) `` |

`showSuccessToast` is already imported on line 25 — no import change needed.

---

### Task 6: Add collapsible className in `InstanceCard.tsx`

**Skills:** none

**Files:**
- Modify: `frontend/src/components/InstanceCard.tsx`

- [ ] **Step 1: Add className to Collapsible.Content**

Replace:
```tsx
          <Collapsible.Content style={{ overflow: 'hidden' }}>
```
With:
```tsx
          <Collapsible.Content className="collapsible-content" style={{ overflow: 'hidden' }}>
```

---

### Task 7: Update `index.css` — remove sonner, add animations

**Skills:** `tailwind-design-system`

**Files:**
- Modify: `frontend/src/index.css`

- [ ] **Step 1: Remove sonner CSS blocks**

Remove these two rules entirely:
```css
/* Smaller toast notifications */
[data-sonner-toast] {
  padding: 0.375rem 0.5rem !important;
  font-size: 0.75rem !important;
  min-height: auto !important;
}

[data-sonner-toast] [data-title] {
  font-size: 0.75rem !important;
  line-height: 1.125rem !important;
}
```

- [ ] **Step 2: Add animation rules in their place**

```css
/* Toast slide-in / slide-out (bottom-right) */
@keyframes toastSlideIn {
  from { transform: translateX(calc(100% + 16px)); opacity: 0; }
  to   { transform: translateX(0); opacity: 1; }
}
@keyframes toastSlideOut {
  from { transform: translateX(0); opacity: 1; }
  to   { transform: translateX(calc(100% + 16px)); opacity: 0; }
}
.toast-item[data-state='open']   { animation: toastSlideIn  200ms ease-out; }
.toast-item[data-state='closed'] { animation: toastSlideOut 150ms ease-in forwards; }

/* Collapsible expand / collapse */
@keyframes slideDown {
  from { height: 0; }
  to   { height: var(--radix-collapsible-content-height); }
}
@keyframes slideUp {
  from { height: var(--radix-collapsible-content-height); }
  to   { height: 0; }
}
.collapsible-content[data-state='open']   { animation: slideDown 200ms ease-out; }
.collapsible-content[data-state='closed'] { animation: slideUp   200ms ease-out; }

/* Settings tab content fade-in */
@keyframes tabFadeIn {
  from { opacity: 0; transform: translateY(4px); }
  to   { opacity: 1; transform: none; }
}
.rt-TabsContent[data-state='active'] { animation: tabFadeIn 150ms ease-out; }
```

---

### Task 8: TypeScript check + commit

**Skills:** none

- [ ] **Step 1: TypeScript check**

```bash
docker exec scoutarr-dev sh -c "node /app/node_modules/typescript/bin/tsc --project /app/frontend/tsconfig.json --noEmit 2>&1"
```

Expected: only the pre-existing `MediaLibraryCard.tsx(1198,37)` error. No new errors.

- [ ] **Step 2: Commit**

```bash
git add frontend/package.json frontend/src/utils/toast.ts frontend/src/components/Toaster.tsx frontend/src/main.tsx frontend/src/pages/Settings.tsx frontend/src/components/InstanceCard.tsx frontend/src/index.css
git commit -m "feat: replace sonner with Radix Toast (bottom-right) and add slide/fade animations"
```
