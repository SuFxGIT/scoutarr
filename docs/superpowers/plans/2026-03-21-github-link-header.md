# GitHub Link in Header Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a GitHub icon button to the app header that links to the Scoutarr repository.

**Architecture:** Single change to `App.tsx` — add a `GitHubLogoIcon` `IconButton` wrapped in a `Tooltip` immediately before `<ThemeToggle />` in the header nav `Flex`. Follows the identical pattern used by `ThemeToggle` (ghost variant, size 2, tooltip).

**Tech Stack:** React 19, `@radix-ui/themes` (`IconButton`, `Tooltip`), `@radix-ui/react-icons` (`GitHubLogoIcon`)

---

## Files Changed

| File | Change |
|------|--------|
| `frontend/src/App.tsx` | Add `GitHubLogoIcon` + `IconButton` to imports; add button before `<ThemeToggle />` |

---

### Task 1: Add GitHub icon button to header

**Files:**
- Modify: `frontend/src/App.tsx:1-10` (imports), `frontend/src/App.tsx:48-70` (nav Flex)

- [ ] **Step 1: Update imports in `frontend/src/App.tsx`**

The current import lines at the top of the file are:

```tsx
import { Flex, Heading, Button, Separator, Box, Spinner, Text } from '@radix-ui/themes';
import { GearIcon, HomeIcon, Pencil1Icon } from '@radix-ui/react-icons';
```

Change them to:

```tsx
import { Flex, Heading, Button, Separator, Box, Spinner, Text, IconButton, Tooltip } from '@radix-ui/themes';
import { GearIcon, HomeIcon, Pencil1Icon, GitHubLogoIcon } from '@radix-ui/react-icons';
```

- [ ] **Step 2: Add the GitHub button before `<ThemeToggle />`**

Locate the nav `Flex` in `NavigationLinks` (around line 48). It currently ends with:

```tsx
        <ThemeToggle />
      </Flex>
```

Add the GitHub button immediately before `<ThemeToggle />`:

```tsx
        <Tooltip content="View on GitHub">
          <IconButton variant="ghost" size="2" asChild>
            <a href="https://github.com/SuFxGIT/scoutarr" target="_blank" rel="noopener noreferrer">
              <GitHubLogoIcon />
            </a>
          </IconButton>
        </Tooltip>
        <ThemeToggle />
      </Flex>
```

- [ ] **Step 3: Verify the build compiles cleanly**

Run from the repo root:
```bash
npm run build
```

Expected: build completes with no TypeScript or Vite errors.

- [ ] **Step 4: Start the dev server and visually verify**

```bash
npm run dev
```

Open `http://localhost:7291` and confirm:
- A GitHub logo icon appears in the header to the left of the theme toggle
- Hovering shows the tooltip "View on GitHub"
- Clicking opens `https://github.com/SuFxGIT/scoutarr` in a new tab
- The icon style matches the theme toggle (ghost, same size)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/App.tsx
git commit -m "feat: add GitHub link icon to header"
```
