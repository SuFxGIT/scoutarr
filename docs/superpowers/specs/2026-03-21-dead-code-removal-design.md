# Dead Code Removal — Design Spec

**Date:** 2026-03-21  
**Scope:** Backend, shared package, frontend  
**Type:** Cleanup — no behaviour change

---

## Overview

Remove dead (unused) code and a duplicated type definition across the monorepo. Changes are strictly cosmetic/structural: no runtime behaviour, routes, components, or service logic is altered.

---

## Changes

### 1. `backend/src/services/radarrService.ts`

**Action:** Remove unused import.

`logger` is imported but never called in this file. All logging in `RadarrService` is handled by the base class `BaseStarrService`.

```diff
- import logger from '../utils/logger.js';
```

---

### 2. `shared/src/types/starr.ts`

**Action:** Delete `StarrTag` interface.

```typescript
export interface StarrTag {
  id: number;
  label: string;
}
```

Zero imports in backend or frontend. Safe to remove.

---

### 3. `shared/src/types/api.ts`

**Action:** Delete `MediaSearchRequest` interface.

Zero imports anywhere in the codebase. Safe to remove.

---

### 4. `backend/src/utils/errorUtils.ts`

**Action:** Delete `export interface ErrorResponse` and inline its shape at the one internal use-site.

`ErrorResponse` is exported but never imported outside this file. The single internal use is `} as ErrorResponse)` inside `handleRouteError`. Replace with an inline type assertion:

```diff
- } as ErrorResponse);
+ } as { error: string; message?: string });
```

Then remove the interface declaration.

---

### 5. `frontend/src/services/index.ts`

**Action:** Delete the file.

This is a barrel re-export of all frontend services. No component, page, or utility ever imports from this barrel — every consumer imports from the individual service files directly (e.g. `'../services/configService'`). The file is completely unreachable.

---

### 6. `frontend/src/utils/appInfo.ts`

**Action:** Remove locally-defined `StarrInstanceConfig` union type; import it from `@scoutarr/shared`.

The local definition exactly duplicates the one in `shared/src/types/starr.ts`:

```typescript
// LOCAL (duplicated) — REMOVE
export type StarrInstanceConfig = RadarrInstance | SonarrInstance | LidarrInstance | ReadarrInstance;
```

Replace with an import from the shared package (which already re-exports it through `frontend/src/types/config.ts` or directly from `@scoutarr/shared`):

```typescript
import type { StarrInstanceConfig } from '@scoutarr/shared';
export type { StarrInstanceConfig };
```

The existing imports of `RadarrInstance`, `SonarrInstance`, `LidarrInstance`, `ReadarrInstance` in that file are already present for other uses, so no new imports are needed.

---

### 7. `frontend/src/types/api.ts`

**Action:** Remove three unused re-exports.

`SearchResults`, `InstanceStatus`, and `StatusResponse` are re-exported through this file but are never imported by any frontend component, page, or service. They are backend-only types. With `noUnusedLocals: true` enforced in `frontend/tsconfig.json`, this is verifiably safe.

```diff
  export type {
    SearchResult,
-   SearchResults,
-   InstanceStatus,
-   StatusResponse,
    SchedulerStatus,
    SyncSchedulerStatus,
    Stats,
    ...
  }
```

---

## Non-goals

- No changes to runtime logic, route handlers, service methods, or component rendering.
- No changes to import conventions for components that currently bypass `frontend/src/types/` and import directly from `@scoutarr/shared` (addressed in a separate cleanup if desired).
- No new files created.

---

## Risk

**Very low.** All removals are confirmed dead by:
- Grep-based import search across the entire monorepo
- TypeScript `noUnusedLocals: true` / `noUnusedParameters: true` already enforced on the frontend
- No runtime code removed — only type declarations and one unused import
