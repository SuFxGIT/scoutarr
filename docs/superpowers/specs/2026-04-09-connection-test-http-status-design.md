# Connection Test HTTP Status Fix — Design

**Date:** 2026-04-09  
**Status:** Approved

---

## Problem

`POST /test/:app` returns HTTP `500` when a connection test fails (wrong credentials, host unreachable, etc.). This is semantically incorrect — HTTP 500 signals an *unexpected server error*, not a deliberate "tried to connect, got a failure" result. Middleware and monitoring tools treat 500 as a server fault.

## Solution

Change the `/test/:app` route to always return HTTP `200`. The success/failure outcome is conveyed entirely through the JSON response body (`{ success: true | false, ... }`). The request itself always succeeds — Scoutarr performed the test and is reporting back.

## Change

**File:** `backend/src/routes/config.ts`

```diff
- const status = testResult.success ? 200 : 500;
+ const status = 200;
```

No other code changes are required. The frontend reads `result.success` from the response body to determine success/failure.

**Side-effect fix (double toast bug):** Currently, when the backend returns `500` for a failed test, the axios response interceptor in `apiClient.ts` fires first (showing a toast with the error message from the body), then rejects the promise, causing the `catch` block in `Settings.tsx` to fire a second toast. This produces two overlapping error toasts per failed connection test. After this fix, a `200` response resolves normally — the interceptor does not fire — and only the `else` branch in `Settings.tsx` shows the single clean toast: `"Connection test failed"`.

## Error handling

- The `catch` block in the same route (unexpected throws) keeps returning `500` via `handleRouteError` — that remains correct.
- Only the intentional `success: false` path changes from `500` → `200`.
