# Dead Code Removal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove dead code and one duplicated type definition across the Scoutarr monorepo — no behaviour change.

**Architecture:** Seven targeted edits across six files plus one file deletion. All changes are type/import-level; no runtime logic is touched. TypeScript compilation (`tsc --noEmit`) is the verification mechanism throughout.

**Tech Stack:** TypeScript 5, npm workspaces (shared / frontend / backend), Node 22

**Spec:** `docs/superpowers/specs/2026-03-21-dead-code-removal-design.md`

**Skills:** none

---

## File Map

| Action | File |
|--------|------|
| Modify | `backend/src/services/radarrService.ts` |
| Modify | `shared/src/types/starr.ts` |
| Modify | `shared/src/types/api.ts` |
| Modify | `backend/src/utils/errorUtils.ts` |
| **Delete** | `frontend/src/services/index.ts` |
| Modify | `frontend/src/utils/appInfo.ts` |
| Modify | `frontend/src/types/api.ts` |

---

## How to verify TypeScript compiles

Run after each task to confirm no regressions:

```bash
# backend
node /mnt/user/other/projects/scoutarr/node_modules/typescript/bin/tsc \
  --project /mnt/user/other/projects/scoutarr/backend/tsconfig.json --noEmit

# frontend
node /mnt/user/other/projects/scoutarr/node_modules/typescript/bin/tsc \
  --project /mnt/user/other/projects/scoutarr/frontend/tsconfig.json --noEmit

# shared
node /mnt/user/other/projects/scoutarr/node_modules/typescript/bin/tsc \
  --project /mnt/user/other/projects/scoutarr/shared/tsconfig.json --noEmit
```

Expected output for each: no output (zero errors).

---

## Task 1: Remove unused `logger` import from `radarrService.ts`

**Files:**
- Modify: `backend/src/services/radarrService.ts:3`

- [ ] **Step 1: Remove the import line**

  In `backend/src/services/radarrService.ts`, remove line 3:
  
  ```diff
  import { RadarrInstance } from '@scoutarr/shared';
  import { BaseStarrService } from './baseStarrService.js';
  - import logger from '../utils/logger.js';
  import { FilterableMedia } from '../utils/filterUtils.js';
  ```

- [ ] **Step 2: Verify backend compiles**

  ```bash
  node /mnt/user/other/projects/scoutarr/node_modules/typescript/bin/tsc \
    --project /mnt/user/other/projects/scoutarr/backend/tsconfig.json --noEmit
  ```
  
  Expected: no output.

- [ ] **Step 3: Commit**

  ```bash
  cd /mnt/user/other/projects/scoutarr
  git add backend/src/services/radarrService.ts
  git commit -m "chore: remove unused logger import from radarrService"
  ```

---

## Task 2: Remove unused `StarrTag` interface from shared

**Files:**
- Modify: `shared/src/types/starr.ts:6-9`

- [ ] **Step 1: Delete the `StarrTag` interface block**

  In `shared/src/types/starr.ts`, remove these lines:
  
  ```diff
  /**
   * Shared types for Starr applications (Radarr, Sonarr, Lidarr, Readarr)
   */
  import type { RadarrInstance, SonarrInstance, LidarrInstance, ReadarrInstance } from './config.js';
  
  - export interface StarrTag {
  -   id: number;
  -   label: string;
  - }
  - 
  export interface StarrQualityProfile {
  ```

- [ ] **Step 2: Verify all three packages compile**

  ```bash
  node /mnt/user/other/projects/scoutarr/node_modules/typescript/bin/tsc \
    --project /mnt/user/other/projects/scoutarr/shared/tsconfig.json --noEmit
  
  node /mnt/user/other/projects/scoutarr/node_modules/typescript/bin/tsc \
    --project /mnt/user/other/projects/scoutarr/backend/tsconfig.json --noEmit
  
  node /mnt/user/other/projects/scoutarr/node_modules/typescript/bin/tsc \
    --project /mnt/user/other/projects/scoutarr/frontend/tsconfig.json --noEmit
  ```
  
  Expected: no output for any.

- [ ] **Step 3: Commit**

  ```bash
  cd /mnt/user/other/projects/scoutarr
  git add shared/src/types/starr.ts
  git commit -m "chore: remove unused StarrTag interface from shared"
  ```

---

## Task 3: Remove unused `MediaSearchRequest` interface from shared

**Files:**
- Modify: `shared/src/types/api.ts`

- [ ] **Step 1: Delete the `MediaSearchRequest` interface block**

  In `shared/src/types/api.ts`, remove these lines (they appear between `MediaSearchConflict` and `MediaSearchResponse`):
  
  ```diff
  export interface MediaSearchConflict {
    id: number;
    reason: string;
  }
  
  - export interface MediaSearchRequest {
  -   appType: 'radarr' | 'sonarr' | 'lidarr' | 'readarr';
  -   instanceId: string;
  -   mediaIds: number[];
  -   force?: boolean;
  - }
  - 
  export interface MediaSearchResponse {
  ```

- [ ] **Step 2: Verify all three packages compile**

  ```bash
  node /mnt/user/other/projects/scoutarr/node_modules/typescript/bin/tsc \
    --project /mnt/user/other/projects/scoutarr/shared/tsconfig.json --noEmit
  
  node /mnt/user/other/projects/scoutarr/node_modules/typescript/bin/tsc \
    --project /mnt/user/other/projects/scoutarr/backend/tsconfig.json --noEmit
  
  node /mnt/user/other/projects/scoutarr/node_modules/typescript/bin/tsc \
    --project /mnt/user/other/projects/scoutarr/frontend/tsconfig.json --noEmit
  ```
  
  Expected: no output for any.

- [ ] **Step 3: Commit**

  ```bash
  cd /mnt/user/other/projects/scoutarr
  git add shared/src/types/api.ts
  git commit -m "chore: remove unused MediaSearchRequest interface from shared"
  ```

---

## Task 4: Remove unused `ErrorResponse` export from `errorUtils.ts`

**Files:**
- Modify: `backend/src/utils/errorUtils.ts`

`ErrorResponse` is exported but never imported outside this file. The single internal use (`} as ErrorResponse)`) must be replaced with an inline type before deleting the interface.

- [ ] **Step 1: Replace the `as ErrorResponse` cast with an inline type**

  In `backend/src/utils/errorUtils.ts`, change the end of `handleRouteError`:
  
  ```diff
    res.status(statusCode).json({
      error: context,
      message: errorMessage
  -  } as ErrorResponse);
  +  } as { error: string; message?: string });
  }
  ```

- [ ] **Step 2: Delete the `ErrorResponse` interface declaration**

  Remove this block from the top of the same file:
  
  ```diff
  /**
  - * Standard error response format
  - */
  - export interface ErrorResponse {
  -   error: string;
  -   message?: string;
  - }
  - 
  /**
   * Extracts error message from unknown error type
   */
  ```

- [ ] **Step 3: Verify backend compiles**

  ```bash
  node /mnt/user/other/projects/scoutarr/node_modules/typescript/bin/tsc \
    --project /mnt/user/other/projects/scoutarr/backend/tsconfig.json --noEmit
  ```
  
  Expected: no output.

- [ ] **Step 4: Commit**

  ```bash
  cd /mnt/user/other/projects/scoutarr
  git add backend/src/utils/errorUtils.ts
  git commit -m "chore: remove unused ErrorResponse export from errorUtils"
  ```

---

## Task 5: Delete unused `frontend/src/services/index.ts` barrel

**Files:**
- Delete: `frontend/src/services/index.ts`

No component or page imports from this barrel — all consumers already import from individual service files directly.

- [ ] **Step 1: Delete the file**

  ```bash
  rm /mnt/user/other/projects/scoutarr/frontend/src/services/index.ts
  ```

- [ ] **Step 2: Verify frontend compiles** (confirms nothing was importing from it)

  ```bash
  node /mnt/user/other/projects/scoutarr/node_modules/typescript/bin/tsc \
    --project /mnt/user/other/projects/scoutarr/frontend/tsconfig.json --noEmit
  ```
  
  Expected: no output.

- [ ] **Step 3: Commit**

  ```bash
  cd /mnt/user/other/projects/scoutarr
  git add -A frontend/src/services/index.ts
  git commit -m "chore: delete unused frontend services barrel index"
  ```

---

## Task 6: Fix `StarrInstanceConfig` duplication in `frontend/src/utils/appInfo.ts`

**Files:**
- Modify: `frontend/src/utils/appInfo.ts`

The local `StarrInstanceConfig` union type is identical to the one in `shared/src/types/starr.ts`. Remove the local definition and import from `@scoutarr/shared`.

The individual instance types (`RadarrInstance` etc.) are already imported from `'../types/config'` and are still needed for the `as RadarrInstance` casts in `buildDefaultInstance` — those imports stay.

- [ ] **Step 1: Update the imports and remove the local type**

  Current state of the top of the file:
  
  ```typescript
  import type { AppType } from './constants';
  import type { RadarrInstance, SonarrInstance, LidarrInstance, ReadarrInstance } from '../types/config';
  
  export type StarrInstanceConfig = RadarrInstance | SonarrInstance | LidarrInstance | ReadarrInstance;
  ```
  
  Replace with:
  
  ```typescript
  import type { AppType } from './constants';
  import type { RadarrInstance, SonarrInstance, LidarrInstance, ReadarrInstance, StarrInstanceConfig } from '@scoutarr/shared';
  
  export type { StarrInstanceConfig };
  ```
  
  Note: the individual instance type imports move from `'../types/config'` to `'@scoutarr/shared'` because `@scoutarr/shared` is already the source of truth and `'../types/config'` merely re-exports from there.

- [ ] **Step 2: Verify frontend compiles**

  ```bash
  node /mnt/user/other/projects/scoutarr/node_modules/typescript/bin/tsc \
    --project /mnt/user/other/projects/scoutarr/frontend/tsconfig.json --noEmit
  ```
  
  Expected: no output.

- [ ] **Step 3: Commit**

  ```bash
  cd /mnt/user/other/projects/scoutarr
  git add frontend/src/utils/appInfo.ts
  git commit -m "chore: remove duplicated StarrInstanceConfig from appInfo, import from shared"
  ```

---

## Task 7: Prune unused re-exports from `frontend/src/types/api.ts`

**Files:**
- Modify: `frontend/src/types/api.ts`

`SearchResults`, `InstanceStatus`, and `StatusResponse` are re-exported here but never imported by any frontend component, page, or service. They are backend-only runtime concerns. Remove them.

- [ ] **Step 1: Update the re-export list**

  Current file content:
  
  ```typescript
  /**
   * API Response Types
   * Re-exports from shared package for consistency
   */
  
  export type {
    SearchResults,
    Stats,
    InstanceStatus,
    StatusResponse,
    SchedulerStatus,
    SyncSchedulerStatus,
  } from '@scoutarr/shared';
  ```
  
  Replace with:
  
  ```typescript
  /**
   * API Response Types
   * Re-exports from shared package for consistency
   */
  
  export type {
    Stats,
    SchedulerStatus,
    SyncSchedulerStatus,
  } from '@scoutarr/shared';
  ```

- [ ] **Step 2: Verify frontend compiles**

  ```bash
  node /mnt/user/other/projects/scoutarr/node_modules/typescript/bin/tsc \
    --project /mnt/user/other/projects/scoutarr/frontend/tsconfig.json --noEmit
  ```
  
  Expected: no output. If any component was secretly importing these types through this re-export, the compiler will report them here — fix the import to point at `@scoutarr/shared` directly.

- [ ] **Step 3: Commit**

  ```bash
  cd /mnt/user/other/projects/scoutarr
  git add frontend/src/types/api.ts
  git commit -m "chore: prune unused SearchResults/InstanceStatus/StatusResponse from frontend types"
  ```

---

## Final verification

- [ ] **Run all three compilers one last time**

  ```bash
  node /mnt/user/other/projects/scoutarr/node_modules/typescript/bin/tsc \
    --project /mnt/user/other/projects/scoutarr/shared/tsconfig.json --noEmit

  node /mnt/user/other/projects/scoutarr/node_modules/typescript/bin/tsc \
    --project /mnt/user/other/projects/scoutarr/backend/tsconfig.json --noEmit

  node /mnt/user/other/projects/scoutarr/node_modules/typescript/bin/tsc \
    --project /mnt/user/other/projects/scoutarr/frontend/tsconfig.json --noEmit
  ```
  
  Expected: no output for any.
