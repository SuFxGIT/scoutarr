# Missing Only Filter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a per-instance "Missing Only" toggle that restricts Scoutarr searches to media with no file, and fix unattended mode to scope tag-clearing to items matching all active instance filters.

**Architecture:** Add `missingOnly?: boolean` to all four instance Zod schemas; push it through `FilterableMedia` and `applyCommonFilters`; populate `hasFile` on Lidarr/Readarr media models; coerce `has_file` from the DB cache; fix unattended mode's tag-clear to use `filterMedia` instead of an ad-hoc monitored-only check; add a UI toggle in `InstanceCard`; update the unattended mode description text.

**Tech Stack:** TypeScript 5 strict, Zod, Express 5, better-sqlite3, React 19, Radix UI Themes

---

## File Map

| File | Change |
|------|--------|
| `shared/src/schemas/config.ts` | Add `missingOnly: z.boolean().optional()` to all four instance schemas |
| `backend/src/utils/filterUtils.ts` | Add `hasFile?` to `FilterableMedia`; add `missingOnly` to `CommonFilterConfig` and `applyCommonFilters` |
| `backend/src/services/baseStarrService.ts` | Pass `missingOnly` to `applyCommonFilters`; log it in filter debug output |
| `backend/src/services/radarrService.ts` | Add `hasFile?: boolean` to `RadarrMovie` interface |
| `backend/src/services/lidarrService.ts` | Add `statistics?` type + `hasFile` field to `LidarrArtist`; populate in `getMedia` |
| `backend/src/services/readarrService.ts` | Add `statistics?` type + `hasFile` field to `ReadarrAuthor`; populate in `getMedia` |
| `backend/src/utils/mediaFileUtils.ts` | Add `statistics?` fallback to `extractFileInfo` for Lidarr/Readarr |
| `backend/src/routes/search.ts` | Add `hasFile: !!m.has_file` to DB→preloadedMedia mapping; fix unattended tag-clear |
| `frontend/src/components/InstanceCard.tsx` | Add Missing Only `Switch` |
| `frontend/src/pages/Settings.tsx` | Update unattended mode description |

---

### Task 1: Shared config schemas

**Skills:** none

**Files:**
- Modify: `shared/src/schemas/config.ts`

- [ ] **Step 1: Add `missingOnly` to all four instance schemas**

Open `shared/src/schemas/config.ts`. Add `missingOnly: z.boolean().optional()` as a new field to each of the four schemas: `radarrInstanceSchema`, `sonarrInstanceSchema`, `lidarrInstanceSchema`, `readarrInstanceSchema`. The types in `shared/src/types/config.ts` are derived via `z.infer<>` — no manual update.

After editing, each schema object should contain:
```typescript
missingOnly: z.boolean().optional(),
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /mnt/user/other/projects/scoutarr
npm run build 2>&1 | head -40
```

Expected: no errors related to schema changes.

- [ ] **Step 3: Commit**

```bash
git add shared/src/schemas/config.ts
git commit -m "feat: add missingOnly to instance schemas"
```

---

### Task 2: FilterableMedia + applyCommonFilters

**Skills:** nodejs-backend-patterns

**Files:**
- Modify: `backend/src/utils/filterUtils.ts`

- [ ] **Step 1: Load skill**

Read the full contents of `/mnt/user/other/projects/scoutarr/.agents/skills/nodejs-backend-patterns/SKILL.md`.

- [ ] **Step 2: Add `hasFile?` to `FilterableMedia`**

In `backend/src/utils/filterUtils.ts`, add `hasFile?: boolean` to the `FilterableMedia` interface (after the existing `status` field):

```typescript
export interface FilterableMedia {
  id: number;
  monitored: boolean;
  tags: string[];
  qualityProfileId?: number;
  qualityProfileName?: string;
  status: string;
  hasFile?: boolean;          // ← add this
  lastSearchTime?: string;
  // ... rest unchanged
}
```

- [ ] **Step 3: Add `missingOnly` to `CommonFilterConfig`**

In the same file, add `missingOnly?: boolean` to the `CommonFilterConfig` interface:

```typescript
interface CommonFilterConfig {
  monitored?: boolean;
  tagName: string;
  ignoreTag?: string;
  qualityProfileName?: string;
  missingOnly?: boolean;      // ← add this
  getQualityProfiles: () => Promise<StarrQualityProfile[]>;
  getTagId: (tagName: string) => Promise<number | null>;
}
```

- [ ] **Step 4: Apply `missingOnly` filter in `applyCommonFilters`**

At the end of `applyCommonFilters`, after the `ignoreTag` filter block, add:

```typescript
  // Filter to missing media only (no file)
  if (config.missingOnly) {
    const before = filtered.length;
    filtered = filtered.filter(m => m.hasFile === false);
    logger.debug('🔽 Filtered by missing only', {
      before,
      after: filtered.length,
      appName
    });
  }
```

- [ ] **Step 5: Verify TypeScript compiles**

```bash
cd /mnt/user/other/projects/scoutarr
npm run build 2>&1 | head -40
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add backend/src/utils/filterUtils.ts
git commit -m "feat: add hasFile and missingOnly to FilterableMedia and applyCommonFilters"
```

---

### Task 3: BaseStarrService — pass missingOnly through

**Skills:** nodejs-backend-patterns

**Files:**
- Modify: `backend/src/services/baseStarrService.ts`

- [ ] **Step 1: Load skill**

Read the full contents of `/mnt/user/other/projects/scoutarr/.agents/skills/nodejs-backend-patterns/SKILL.md`.

- [ ] **Step 2: Pass `missingOnly` into `applyCommonFilters`**

In `filterMediaItems` in `baseStarrService.ts`, find the call to `applyCommonFilters`. It currently passes:
```typescript
{
  monitored: (config as any).monitored,
  tagName: (config as any).tagName,
  ignoreTag: (config as any).ignoreTag,
  qualityProfileName: (config as any).qualityProfileName,
  getQualityProfiles: ...,
  getTagId: ...
}
```

Add `missingOnly: (config as any).missingOnly` to this object.

- [ ] **Step 3: Add `missingOnly` to the filter log**

In `filterMediaItems`, find the `filters:` object passed to the initial `logger.info` call (the one with `monitored`, `tagName`, `ignoreTag`, `qualityProfileName`, `statusFilter`). Add:

```typescript
missingOnly: (config as any).missingOnly,
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
cd /mnt/user/other/projects/scoutarr
npm run build 2>&1 | head -40
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/baseStarrService.ts
git commit -m "feat: pass missingOnly through filterMediaItems"
```

---

### Task 4: RadarrService — add hasFile to RadarrMovie

**Skills:** nodejs-backend-patterns

**Files:**
- Modify: `backend/src/services/radarrService.ts`

- [ ] **Step 1: Load skill**

Read the full contents of `/mnt/user/other/projects/scoutarr/.agents/skills/nodejs-backend-patterns/SKILL.md`.

- [ ] **Step 2: Add `hasFile?` to `RadarrMovie`**

In `backend/src/services/radarrService.ts`, the `RadarrMovie` interface currently is:

```typescript
export interface RadarrMovie extends FilterableMedia {
  title: string;
}
```

Update it to:

```typescript
export interface RadarrMovie extends FilterableMedia {
  title: string;
  hasFile?: boolean; // natively returned by Radarr API
}
```

No transformation code needed — `fetchMediaWithScores` passes the full API response through and the Radarr `/api/v3/movie` endpoint returns `hasFile: boolean` on every movie object.

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd /mnt/user/other/projects/scoutarr
npm run build 2>&1 | head -40
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add backend/src/services/radarrService.ts
git commit -m "feat: add hasFile to RadarrMovie interface"
```

---

### Task 5: LidarrService — statistics type + hasFile population

**Skills:** nodejs-backend-patterns

**Files:**
- Modify: `backend/src/services/lidarrService.ts`

- [ ] **Step 1: Load skill**

Read the full contents of `/mnt/user/other/projects/scoutarr/.agents/skills/nodejs-backend-patterns/SKILL.md`.

- [ ] **Step 2: Add `statistics?` to `LidarrArtist`**

The `LidarrArtist` interface currently is:

```typescript
export interface LidarrArtist extends FilterableMedia {
  artistName: string;
}
```

Update it to:

```typescript
export interface LidarrArtist extends FilterableMedia {
  artistName: string;
  hasFile?: boolean;
  statistics?: { trackFileCount?: number };
}
```

- [ ] **Step 3: Populate `hasFile` in `getMedia`**

`LidarrService.getMedia` calls `this.fetchMediaWithScores(config)`. `fetchMediaWithScores` returns the raw API objects typed as `LidarrArtist[]`.

The Lidarr `/api/v1/artist` endpoint returns a `statistics` object with `trackFileCount` on each artist. After the call to `fetchMediaWithScores`, map the results to attach `hasFile`:

```typescript
async getMedia(config: LidarrInstance): Promise<LidarrArtist[]> {
  const artists = await this.fetchMediaWithScores(config);
  return artists.map(a => ({
    ...a,
    hasFile: ((a as any).statistics?.trackFileCount ?? 0) > 0,
  }));
}
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
cd /mnt/user/other/projects/scoutarr
npm run build 2>&1 | head -40
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/lidarrService.ts
git commit -m "feat: populate hasFile on LidarrArtist from statistics"
```

---

### Task 6: ReadarrService — statistics type + hasFile population

**Skills:** nodejs-backend-patterns

**Files:**
- Modify: `backend/src/services/readarrService.ts`

- [ ] **Step 1: Load skill**

Read the full contents of `/mnt/user/other/projects/scoutarr/.agents/skills/nodejs-backend-patterns/SKILL.md`.

- [ ] **Step 2: Add `statistics?` to `ReadarrAuthor`**

The `ReadarrAuthor` interface currently is:

```typescript
export interface ReadarrAuthor extends FilterableMedia {
  authorName: string;
}
```

Update it to:

```typescript
export interface ReadarrAuthor extends FilterableMedia {
  authorName: string;
  hasFile?: boolean;
  statistics?: { bookFileCount?: number };
}
```

- [ ] **Step 3: Populate `hasFile` in `getMedia`**

Mirror the Lidarr approach:

```typescript
async getMedia(config: ReadarrInstance): Promise<ReadarrAuthor[]> {
  const authors = await this.fetchMediaWithScores(config);
  return authors.map(a => ({
    ...a,
    hasFile: ((a as any).statistics?.bookFileCount ?? 0) > 0,
  }));
}
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
cd /mnt/user/other/projects/scoutarr
npm run build 2>&1 | head -40
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/readarrService.ts
git commit -m "feat: populate hasFile on ReadarrAuthor from statistics"
```

---

### Task 7: mediaFileUtils — statistics fallback for DB sync

**Skills:** nodejs-backend-patterns

**Files:**
- Modify: `backend/src/utils/mediaFileUtils.ts`

- [ ] **Step 1: Load skill**

Read the full contents of `/mnt/user/other/projects/scoutarr/.agents/skills/nodejs-backend-patterns/SKILL.md`.

- [ ] **Step 2: Add `statistics?` to `MediaWithFiles`**

In `backend/src/utils/mediaFileUtils.ts`, the `MediaWithFiles` interface currently is:

```typescript
export interface MediaWithFiles {
  movieFile?: { dateAdded?: string; customFormatScore?: number };
  episodeFile?: { dateAdded?: string; customFormatScore?: number };
  trackFiles?: Array<{ dateAdded?: string; customFormatScore?: number }>;
  bookFiles?: Array<{ dateAdded?: string; customFormatScore?: number }>;
  [key: string]: unknown;
}
```

Add a `statistics` field:

```typescript
export interface MediaWithFiles {
  movieFile?: { dateAdded?: string; customFormatScore?: number };
  episodeFile?: { dateAdded?: string; customFormatScore?: number };
  trackFiles?: Array<{ dateAdded?: string; customFormatScore?: number }>;
  bookFiles?: Array<{ dateAdded?: string; customFormatScore?: number }>;
  statistics?: { trackFileCount?: number; bookFileCount?: number };
  [key: string]: unknown;
}
```

- [ ] **Step 3: Add statistics fallback in `extractFileInfo`**

At the end of the `extractFileInfo` function, after all the existing `if/else if` branches (movieFile, episodeFile, trackFiles, bookFiles), and before the `return` statement, add a fallback for Lidarr/Readarr where no embedded file arrays are present:

```typescript
  // Lidarr/Readarr fallback: use statistics counts when no embedded file arrays
  if (!hasFile && media.statistics) {
    const count = (media.statistics.trackFileCount ?? media.statistics.bookFileCount ?? 0);
    hasFile = count > 0;
  }

  return { dateImported, hasFile, customFormatScore };
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
cd /mnt/user/other/projects/scoutarr
npm run build 2>&1 | head -40
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add backend/src/utils/mediaFileUtils.ts
git commit -m "feat: use statistics fallback for Lidarr/Readarr hasFile in DB sync"
```

---

### Task 8: search.ts — DB mapping + unattended mode fix

**Skills:** nodejs-backend-patterns

**Files:**
- Modify: `backend/src/routes/search.ts`

- [ ] **Step 1: Load skill**

Read the full contents of `/mnt/user/other/projects/scoutarr/.agents/skills/nodejs-backend-patterns/SKILL.md`.

- [ ] **Step 2: Add `hasFile` to the DB→preloadedMedia mapping**

In `processAppInstances`, find the `preloadedMedia = dbMedia.map(m => ({` block. It currently maps these fields:

```typescript
{
  id: m.media_id,
  title: m.title,
  monitored: m.monitored,
  tags: m.tags,
  qualityProfileName: m.quality_profile_name || undefined,
  status: m.status,
  lastSearchTime: m.last_search_time || undefined,
  seriesId: m.series_id ?? undefined,
}
```

Add `hasFile: !!m.has_file,` (the `!!` coerces SQLite's integer `0`/`1` to boolean):

```typescript
{
  id: m.media_id,
  title: m.title,
  monitored: m.monitored,
  tags: m.tags,
  qualityProfileName: m.quality_profile_name || undefined,
  status: m.status,
  hasFile: !!m.has_file,       // ← add this line
  lastSearchTime: m.last_search_time || undefined,
  seriesId: m.series_id ?? undefined,
}
```

- [ ] **Step 3: Fix unattended mode tag-clear in `processApplication`**

Find the unattended mode block in `processApplication`. It currently contains:

```typescript
if (processor.unattended && filtered.length === 0) {
  logger.info(`🔄 Unattended mode: No media found, removing tag from all ${processor.name} and re-filtering`);
  const tagName = processor.config.tagName;
  const tagId = await processor.getTagId(processor.config, tagName);
  if (tagId !== null && tagName) {
    // Filter by tag NAME now (media.tags is now string[])
    const mediaWithTag = allMedia.filter(m => {
      return m.monitored === processor.config.monitored && Array.isArray(m.tags) && m.tags.includes(tagName);
    });
    if (mediaWithTag.length > 0) {
      const mediaIds = [...new Set(mediaWithTag.map(processor.getMediaId))];
      await processor.removeTag(processor.config, mediaIds, tagId);

      // Update DB immediately: strip tagName from each affected item's tags
      const isSonarr = processor.appType === 'sonarr';
      for (const m of mediaWithTag) {
        const id = processor.getMediaId(m);
        const updatedTags = (m.tags as string[]).filter(t => t !== tagName);
        statsService.updateMediaTags(processor.instanceId, [id], updatedTags, isSonarr);
      }

      // Re-fetch and re-filter
      allMedia = await processor.getMedia(processor.config);
      filtered = await processor.filterMedia(processor.config, allMedia);
    }
  }
}
```

Replace the ad-hoc `mediaWithTag` filter with a full filter chain. The new logic:
1. Build `tempAllMedia` — a copy of `allMedia` with `tagName` stripped from each item's `tags` (so `filterMedia` won't exclude them on the tag-exclusion check).
2. Call `processor.filterMedia(processor.config, tempAllMedia)` to get all items passing every active filter.
3. Keep only those whose **original** `tags` include `tagName` — those are the ones to un-tag.

Replace that block with:

```typescript
if (processor.unattended && filtered.length === 0) {
  logger.info(`🔄 Unattended mode: No media found, removing tag from filtered set of ${processor.name} and re-filtering`);
  const tagName = processor.config.tagName;
  const tagId = await processor.getTagId(processor.config, tagName);
  if (tagId !== null && tagName) {
    // Build a temp copy with tagName stripped so filterMedia sees all filter-passing items
    const tempAllMedia = allMedia.map(m => ({
      ...m,
      tags: (m.tags as string[]).filter(t => t !== tagName)
    })) as typeof allMedia;

    // Run the full filter chain (monitored, quality profile, status, missingOnly, etc.)
    const filterPassingMedia = await processor.filterMedia(processor.config, tempAllMedia);

    // From filter-passing items, find those that originally had the tag
    const filterPassingIds = new Set(filterPassingMedia.map(processor.getMediaId));
    const mediaWithTag = allMedia.filter(m =>
      filterPassingIds.has(processor.getMediaId(m)) &&
      Array.isArray(m.tags) &&
      m.tags.includes(tagName)
    );

    if (mediaWithTag.length > 0) {
      const mediaIds = [...new Set(mediaWithTag.map(processor.getMediaId))];
      await processor.removeTag(processor.config, mediaIds, tagId);

      // Update DB immediately: strip tagName from each affected item's tags
      const isSonarr = processor.appType === 'sonarr';
      for (const m of mediaWithTag) {
        const id = processor.getMediaId(m);
        const updatedTags = (m.tags as string[]).filter(t => t !== tagName);
        statsService.updateMediaTags(processor.instanceId, [id], updatedTags, isSonarr);
      }

      // Re-fetch and re-filter
      allMedia = await processor.getMedia(processor.config);
      filtered = await processor.filterMedia(processor.config, allMedia);
    }
  }
}
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
cd /mnt/user/other/projects/scoutarr
npm run build 2>&1 | head -40
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add backend/src/routes/search.ts
git commit -m "feat: fix unattended tag-clear to use full filter chain; add hasFile to DB mapping"
```

---

### Task 9: InstanceCard UI toggle

**Skills:** shadcn

**Files:**
- Modify: `frontend/src/components/InstanceCard.tsx`

- [ ] **Step 1: Load skill**

Read the full contents of `/mnt/user/other/projects/scoutarr/.agents/skills/shadcn/SKILL.md`.

- [ ] **Step 2: Add "Missing Only" Switch**

In `InstanceCard.tsx`, find the "Search Monitored … Only" `Switch` row (the `Flex` block containing `"Search Monitored {appInfo.mediaType} Only"`). Add the following block **immediately after** that entire `<Flex direction="row" ...>` block (still inside `<Flex direction="column" gap="3" ...>`):

```tsx
<Flex direction="row" align="center" justify="between" gap="2">
  <Flex align="center" gap="1">
    <Text size="2" weight="medium">Missing Only</Text>
    <Tooltip content={`When enabled, only ${appInfo.mediaTypePlural} with no file will be searched. Use this to find and retrieve missing media instead of upgrading existing files.`}>
      <QuestionMarkCircledIcon style={{ cursor: 'help', color: 'var(--gray-9)', width: '14px', height: '14px' }} />
    </Tooltip>
  </Flex>
  <Switch
    checked={instance.missingOnly ?? false}
    onCheckedChange={(checked: boolean) => updateInstanceConfig(appType, instance.id, 'missingOnly', checked)}
  />
</Flex>
```

This is placed **after** the Monitored toggle and **before** any app-specific status selects (radarr/sonarr/lidarr/readarr blocks), keeping all search-filter toggles grouped together.

- [ ] **Step 3: Verify the frontend builds**

```bash
cd /mnt/user/other/projects/scoutarr
npm run build 2>&1 | head -40
```

Expected: no TypeScript errors. (The `instance.missingOnly` field exists on the inferred types from Step 1.)

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/InstanceCard.tsx
git commit -m "feat: add Missing Only toggle to InstanceCard"
```

---

### Task 10: Settings — update unattended mode description

**Skills:** none

**Files:**
- Modify: `frontend/src/pages/Settings.tsx`

- [ ] **Step 1: Locate the unattended mode description**

In `frontend/src/pages/Settings.tsx`, find the two `<Text size="1" color="gray">` blocks that describe unattended mode's Enabled/Disabled behaviour. They currently read:

```
Enabled: Scoutarr automatically removes its tag from all media in that instance, then immediately re-runs the search from scratch — keeping the upgrade cycle going indefinitely without any manual intervention.
```

and:

```
Disabled: Scoutarr does nothing and skips the run. The schedule will keep firing but no searches will happen until untagged media becomes available (e.g. a new item is added, or you clear tags manually).
```

- [ ] **Step 2: Update the Enabled description**

Replace the `<Text>` block for the **Enabled** state with:

```tsx
<Text size="1" color="gray">
  <Text size="1" weight="medium">Enabled:</Text> When all eligible media matching the instance's active filters has been searched, Scoutarr automatically removes its tag from those items, then immediately re-runs the search — keeping the cycle going indefinitely. Works with all filter combinations, including Missing Only.
</Text>
```

Leave the **Disabled** description and all surrounding JSX unchanged.

- [ ] **Step 3: Verify the frontend builds**

```bash
cd /mnt/user/other/projects/scoutarr
npm run build 2>&1 | head -40
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/Settings.tsx
git commit -m "docs: update unattended mode description to reflect filter-scoped clearing"
```

---

### Task 11: Full build verification

**Skills:** none

- [ ] **Step 1: Full production build**

```bash
cd /mnt/user/other/projects/scoutarr
npm run build 2>&1
```

Expected: exits with code 0, no TypeScript errors across shared/frontend/backend.

- [ ] **Step 2: Manual smoke test — Missing Only toggle visible**

Start the dev servers:

```bash
npm run dev
```

Open the Settings page in the browser (port 7291). Expand any instance card. Confirm:
- "Missing Only" toggle appears below "Search Monitored … Only" and above any status selects.
- Toggle can be switched on/off and saved via the main Save button without errors.

- [ ] **Step 3: Manual smoke test — filter behaves**

With "Missing Only" enabled on an instance, trigger a manual search run via the dashboard / API (`POST /search/run`). In the backend logs, confirm:
- `🔽 Filtered by missing only` appears in output with counts.
- `missingOnly: true` appears in the filter summary log.

- [ ] **Step 4: Manual smoke test — unattended mode**

With "Missing Only" enabled, manually set all missing-only items to already have the tag (via the Starr app UI), then trigger a search run. Confirm:
- Unattended mode fires if all matching items are tagged.
- Log shows `🔄 Unattended mode` message.
- Tags are removed only from missing items (not from items that have files).

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "chore: final build verification for missing-only filter feature"
```
