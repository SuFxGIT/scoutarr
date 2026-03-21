# GitHub Link in Header — Design Spec

**Date:** 2026-03-21
**Status:** Approved

---

## Overview

Add a GitHub icon button to the app header linking to the Scoutarr GitHub repository. Icon-only, consistent with the existing `ThemeToggle` style.

---

## Design

A `GitHubLogoIcon` `IconButton` placed immediately before `<ThemeToggle />` in the header nav `Flex` in `App.tsx`.

```tsx
<Tooltip content="View on GitHub">
  <IconButton variant="ghost" size="2" asChild>
    <a href="https://github.com/SuFxGIT/scoutarr" target="_blank" rel="noopener noreferrer">
      <GitHubLogoIcon />
    </a>
  </IconButton>
</Tooltip>
```

- `variant="ghost"` and `size="2"` match the `ThemeToggle` `IconButton`
- `asChild` + `<a>` renders as a native anchor (correct semantics, opens new tab)
- `rel="noopener noreferrer"` is standard security practice for `target="_blank"` links
- Tooltip text: `"View on GitHub"`

---

## Files Changed

| File | Change |
|------|--------|
| `frontend/src/App.tsx` | Add `GitHubLogoIcon` and `IconButton` to imports; add button before `<ThemeToggle />` |
