# Clear All Tags Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Clear All Tags" button in the Advanced settings tab that removes Scoutarr-managed tags from every item across all configured instances in one action.

**Architecture:** A new `POST /api/config/clear-tags/all` backend endpoint loops over all configured instances (radarr, sonarr, lidarr, readarr) and calls the existing per-instance clear logic for each. The frontend adds a `clearAllTags()` service method, a `useMutation`, and a button + `ConfirmDialog` in the Advanced tab — identical pattern to the existing "Clear Statistics" section.

**Tech Stack:** Express 5, TypeScript, React 19, `@radix-ui/themes`, `@tanstack/react-query`, existing `configService`/`statsService`/`getServiceForApp` utilities.

---

### Task 1: Backend — `POST /config/clear-tags/all` endpoint

**Files:**
- Modify: `backend/src/routes/config.ts`

The new route reuses the per-instance logic already in the file. It iterates `APP_TYPES`, finds configured instances via `configService.getConfig().applications[app]`, and calls `findInstanceConfig` + the same tag-clearing steps for each.

- [ ] **Step 1: Add the route at the bottom of `backend/src/routes/config.ts`**, just before the final closing line:

```typescript
// Clear tags from all media across all configured instances
configRouter.post('/clear-tags/all', async (_req, res) => {
  logger.info('🧹 Clearing tags for all instances');
  try {
    const config = configService.getConfig();
    let totalInstances = 0;
    let totalCleared = 0;
    const errors: string[] = [];

    for (const appType of APP_TYPES) {
      const instances = config.applications[appType as AppType];
      if (!Array.isArray(instances)) continue;

      for (const instance of instances) {
        if (!instance.url || !instance.apiKey) continue;

        try {
          const service = getServiceForApp(appType as AppType);
          const dbInstance = await statsService.getInstance(instance.id);
          if (!dbInstance) continue;

          const scoutarrTags = JSON.parse(dbInstance.scoutarr_tags || '[]') as string[];
          const ignoreTags = JSON.parse(dbInstance.ignore_tags || '[]') as string[];
          const allManagedTags = [...scoutarrTags, ...ignoreTags];

          if (allManagedTags.length === 0) continue;

          const [allMedia, allTags] = await Promise.all([
            service.getMedia(instance),
            service.getAllTags(instance),
          ]);

          const tagIdToName = new Map(allTags.map(t => [t.id, t.label]));
          const tagNameToId = new Map(allTags.map(t => [t.label, t.id]));

          const mediaWithTagNames = allMedia.map(item => ({
            ...item,
            tagNames: item.tags.map((id: number) => tagIdToName.get(id) ?? `unknown-tag-${id}`),
          }));

          for (const tagName of allManagedTags) {
            const tagId = tagNameToId.get(tagName) ?? null;
            if (tagId !== null) {
              const taggedMedia = mediaWithTagNames.filter(m => m.tagNames.includes(tagName));
              if (taggedMedia.length > 0) {
                const taggedMediaIds = [...new Set(taggedMedia.map(media => service.getMediaId(media)))];
                await service.removeTag(instance, taggedMediaIds, tagId);
                totalCleared += taggedMediaIds.length;
              }
            }
          }

          await statsService.clearScoutarrTagsFromInstance(instance.id);

          const syncResult = await syncInstanceMedia({
            instanceId: instance.id,
            appType: appType as AppType,
            instance,
          });
          await statsService.syncMediaToDatabase(
            instance.id,
            syncResult.mediaWithTags as Parameters<typeof statsService.syncMediaToDatabase>[1]
          );

          totalInstances++;
        } catch (instanceError: unknown) {
          const msg = getErrorMessage(instanceError);
          logger.error(`❌ Failed to clear tags for ${appType} instance ${instance.id}`, { error: msg });
          errors.push(`${appType}/${instance.id}: ${msg}`);
        }
      }
    }

    if (errors.length > 0) {
      logger.warn('⚠️  Clear all tags completed with errors', { errors });
    }

    logger.info(`✅ Cleared tags across ${totalInstances} instances, ${totalCleared} items affected`);
    res.json({
      success: true,
      message: `Cleared tags across ${totalInstances} instance(s), ${totalCleared} item(s) affected`,
      totalInstances,
      totalCleared,
      errors,
    });
  } catch (error: unknown) {
    handleRouteError(res, error, 'Failed to clear all tags');
  }
});
```

- [ ] **Step 2: Start the dev backend and verify the endpoint responds**

```bash
curl -s -X POST http://localhost:5839/api/config/clear-tags/all | jq .
```

Expected: `{ "success": true, "message": "...", "totalInstances": N, ... }`

- [ ] **Step 3: Commit**

```bash
git add backend/src/routes/config.ts
git commit -m "feat: add POST /config/clear-tags/all backend endpoint"
```

---

### Task 2: Frontend service method

**Files:**
- Modify: `frontend/src/services/configService.ts`

- [ ] **Step 1: Add `clearAllTags` method** to the `configService` object, after the existing `clearTags` method:

```typescript
/**
 * Clear tags for all configured instances
 */
async clearAllTags(): Promise<void> {
  await apiClient.post('/config/clear-tags/all');
},
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/services/configService.ts
git commit -m "feat: add clearAllTags service method"
```

---

### Task 3: Frontend — mutation, state, and UI in Advanced tab

**Files:**
- Modify: `frontend/src/pages/Settings.tsx`

There are three places to edit: (1) state for the confirm dialog, (2) the mutation, (3) the UI section in the Advanced tab.

- [ ] **Step 1: Add confirm dialog state** — find the existing `confirmingClearData` state line and add after it:

```typescript
const [confirmingClearAllTags, setConfirmingClearAllTags] = useState<boolean>(false);
```

- [ ] **Step 2: Add the mutation** — find the existing `clearTagsMutation` block (around line 267) and add after it:

```typescript
// Clear all tags mutation (clears tags from all configured instances)
const clearAllTagsMutation = useMutation({
  mutationFn: () => configService.clearAllTags(),
  onSuccess: () => {
    showSuccessToast('All tags cleared successfully');
    setConfirmingClearAllTags(false);
    queryClient.invalidateQueries({ queryKey: ['mediaLibrary'] });
  },
  onError: (error: unknown) => {
    showErrorToast('Failed to clear all tags: ' + getErrorMessage(error));
    setConfirmingClearAllTags(false);
  },
});
```

- [ ] **Step 3: Add the UI section** — in the Advanced tab (`Tabs.Content value="advanced"`), find the `<Separator>` before "Clear Statistics" and add a new section before it (between Unattended Mode and Clear Statistics):

```tsx
<Separator size="4" />

<Flex direction="column" gap="2">
  <Text size="2" weight="medium">Clear All Tags</Text>
  <Text size="1" color="gray">
    Remove all Scoutarr-managed tags from every item across all configured instances. Useful for resetting the search cycle without wiping statistics or configuration.
  </Text>
  <Button
    variant="outline"
    color="red"
    size="2"
    onClick={() => setConfirmingClearAllTags(true)}
    disabled={clearAllTagsMutation.isPending}
  >
    Clear All Tags
  </Button>
  <ConfirmDialog
    open={confirmingClearAllTags}
    onOpenChange={setConfirmingClearAllTags}
    title="Clear All Tags?"
    description="This will remove all Scoutarr-managed tags from every item in every configured instance. Your configuration, statistics, and media library data are not affected. This action cannot be undone."
    confirmLabel="Clear All Tags"
    onConfirm={() => clearAllTagsMutation.mutate()}
    isPending={clearAllTagsMutation.isPending}
  />
</Flex>
```

- [ ] **Step 4: Verify in the browser** — navigate to Settings → Advanced. Confirm the "Clear All Tags" section appears between Unattended Mode and Clear Statistics. Click the button, confirm the dialog appears, cancel it.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/Settings.tsx
git commit -m "feat: add Clear All Tags button in Advanced settings"
```
