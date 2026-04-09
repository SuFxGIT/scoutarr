# Connection Test HTTP Status Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix `POST /config/test/:app` to return HTTP `200` for expected connection failures instead of `500`, and resolve the resulting double-toast bug on the frontend.

**Architecture:** Single-line change to `config.ts` — replace the conditional status code with a constant `200`. The `catch` block (for genuine unexpected errors) already uses `handleRouteError` which returns `500`, so that path is unaffected.

**Tech Stack:** Express 5, TypeScript 5, axios (frontend)

---

### Task 1: Fix the HTTP status code

**Files:**
- Modify: `backend/src/routes/config.ts` (line ~93)

- [ ] **Step 1: Locate the line to change**

Open `backend/src/routes/config.ts` and find:

```typescript
const status = testResult.success ? 200 : 500;
```

- [ ] **Step 2: Apply the change**

Replace it with:

```typescript
const status = 200;
```

The complete surrounding context after the change should look like:

```typescript
    // Test connection
    const testResult = await testStarrConnection(appConfig.url, appConfig.apiKey, app);

    const status = 200;
    const response = testResult.success
      ? { success: true, appName: testResult.appName, version: testResult.version }
      : { error: 'Connection test failed', message: testResult.error || 'Unable to connect' };
```

- [ ] **Step 3: Verify the catch block is untouched**

Confirm the `catch` at the bottom of the handler still reads:

```typescript
  } catch (error: unknown) {
    handleRouteError(res, error, 'Connection test failed');
  }
```

This path is correct — it handles genuine unexpected throws and should remain `500`.

- [ ] **Step 4: Build backend to check for TypeScript errors**

```bash
cd /mnt/user/other/projects/scoutarr && npm run build
```

Expected: build completes with no TypeScript errors.

- [ ] **Step 5: Commit**

```bash
git add backend/src/routes/config.ts
git commit -m "fix: return 200 for failed connection tests instead of 500

Connection test failures are expected outcomes, not server errors.
Returning 500 was causing the axios response interceptor to fire,
resulting in two overlapping error toasts per failed test.

Now the interceptor is bypassed on failure and only the explicit
showErrorToast('Connection test failed') in Settings.tsx fires."
```

---

### Task 2: Manual verification

- [ ] **Step 1: Start the dev server**

```bash
npm run dev:backend
```

- [ ] **Step 2: Test a failing connection**

Using the Scoutarr UI (or curl), configure a Radarr instance with a bad URL or wrong API key and click "Test Connection".

Expected:
- HTTP response is `200` (check browser DevTools → Network tab)
- Exactly **one** error toast appears: `"Connection test failed"`
- The connection status indicator shows failure

- [ ] **Step 3: Test a successful connection**

Configure a valid Radarr instance and click "Test Connection".

Expected:
- HTTP response is `200`
- Success toast appears: `"Connection test successful (vX.X.X)"`
- Connection status indicator shows success
