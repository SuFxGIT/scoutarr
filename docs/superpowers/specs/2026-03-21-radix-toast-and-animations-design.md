# Radix Toast + Collapsible/Tab Animations — Design Spec

**Date:** 2026-03-21
**Scope:** Frontend — `utils/toast.ts`, `components/Toaster.tsx` (new), `components/InstanceCard.tsx`, `pages/Settings.tsx`, `main.tsx`, `index.css`, `package.json`
**Type:** UI improvement — no backend changes, no behaviour changes

---

## Problem

1. **Toast:** Currently uses `sonner` with hard-coded solid-colour backgrounds (`var(--red-9)`, `var(--green-9)`) and a `<Toaster position="top-center" />`. User wants a soft-style Radix Toast in the bottom-right corner. Four call sites in `Settings.tsx` bypass the `showSuccessToast` helper and call `toast.success()` from sonner directly.

2. **Collapsible animation:** Instance cards in Settings expand/collapse with no animation — the state change is instant.

3. **Tab animation:** Switching between Settings tabs (Applications / Notifications / Tasks / Advanced) has no transition.

---

## Goals

- Replace sonner with `@radix-ui/react-toast`, positioned bottom-right.
- Soft-style toasts: muted colour background with coloured border and icon. Dark/light mode compatible via Radix Themes CSS variables.
- Smooth slide-open / slide-close animation for `Collapsible.Content` in InstanceCard.
- Fade-in animation when switching Settings tabs.
- No custom CSS beyond keyframes + `data-state` selectors driven by Radix attributes.
- All existing `showSuccessToast` / `showErrorToast` call sites require zero changes.

---

## Solution

### 1. Toast system — `@radix-ui/react-toast`

**Install:** Add `@radix-ui/react-toast` to `frontend/package.json`. Remove `sonner`.

#### `frontend/src/utils/toast.ts` — rewrite as subscriber emitter

Remove all sonner imports. Keep the same exported function signatures. Internally dispatch to a `Set` of listeners:

```ts
import { type RefObject } from 'react';

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

> `crypto.randomUUID()` is available in all modern browsers and Node 16+.

#### `frontend/src/components/Toaster.tsx` — new file

Subscribes to the emitter. Renders a `Toast.Provider` + `Toast.Viewport` pinned bottom-right. Each `Toast.Root` is keyed by ID and owns its `open` state.

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

**Colour semantics (Radix Themes tokens — automatic dark/light):**

| Token | Light | Dark |
|---|---|---|
| `--green-3` | soft green tint bg | soft green tint bg |
| `--green-9` | vivid green border | vivid green border |
| `--green-11` | readable green text | readable green text |
| `--red-3` / `--red-9` / `--red-11` | same pattern | same pattern |

#### `frontend/src/main.tsx`

Replace:
```tsx
import { Toaster } from 'sonner';
// ...
<Toaster position="top-center" />
```
With:
```tsx
import { Toaster } from './components/Toaster';
// ...
<Toaster />
```

#### `frontend/src/pages/Settings.tsx`

Remove `import { toast } from 'sonner'` (line 24). Replace the 4 direct `toast.success(...)` calls with `showSuccessToast(...)`:

| Line | Before | After |
|---|---|---|
| 198 | `toast.success('Configuration saved successfully!')` | `showSuccessToast('Configuration saved successfully!')` |
| 221 | `toast.success('Search history and CF score history cleared')` | `showSuccessToast('Search history and CF score history cleared')` |
| 251 | `toast.success('App reset completed - all data cleared. Reloading...')` | `showSuccessToast('App reset completed - all data cleared. Reloading...')` |
| 525 | `toast.success(\`Connection test successful${versionText}\`)` | `showSuccessToast(\`Connection test successful${versionText}\`)` |

`showSuccessToast` is already imported from `../utils/toast` on line 25.

---

### 2. Animations — `frontend/src/index.css`

Remove the existing sonner CSS blocks:
```css
/* Remove these: */
[data-sonner-toast] { ... }
[data-sonner-toast] [data-title] { ... }
```

Add all animations in their place:

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
.toast-item[data-state='closed'] { animation: toastSlideOut 150ms ease-in; }

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

> `.rt-TabsContent` is the stable class Radix Themes applies to `Tabs.Content`. No className override needed.
> `.collapsible-content` requires adding `className="collapsible-content"` to the single `Collapsible.Content` in `InstanceCard.tsx`.

#### `frontend/src/components/InstanceCard.tsx`

Add `className="collapsible-content"` to the existing `Collapsible.Content`:

```tsx
// Before:
<Collapsible.Content style={{ overflow: 'hidden' }}>

// After:
<Collapsible.Content className="collapsible-content" style={{ overflow: 'hidden' }}>
```

---

## File Summary

| File | Change |
|---|---|
| `frontend/package.json` | Add `@radix-ui/react-toast`; remove `sonner` |
| `frontend/src/utils/toast.ts` | Rewrite as subscriber emitter (no sonner) |
| `frontend/src/components/Toaster.tsx` | New — Radix Toast component |
| `frontend/src/main.tsx` | Swap sonner `<Toaster>` for local `<Toaster>` |
| `frontend/src/pages/Settings.tsx` | Remove sonner import; 4× `toast.success` → `showSuccessToast` |
| `frontend/src/components/InstanceCard.tsx` | Add `className="collapsible-content"` to `Collapsible.Content` |
| `frontend/src/index.css` | Remove sonner CSS; add 3 sets of keyframes + selectors |

---

## What Stays the Same

- All existing `showSuccessToast` / `showErrorToast` call sites in Settings.tsx, TasksTab.tsx are unchanged.
- `resolveInstanceId`, `resolveInstanceUrl`, Dashboard.tsx untouched.
- No backend changes.
- No data or config schema changes.
