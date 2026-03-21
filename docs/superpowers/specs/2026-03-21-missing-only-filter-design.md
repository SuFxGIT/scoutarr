# Missing Only Filter — Design Spec

**Date:** 2026-03-21  
**Status:** Approved

---

## Overview

Add a per-instance "Missing Only" toggle that restricts Scoutarr's search to media items that have no file (i.e. `hasFile === false`). When enabled, Scoutarr searches for missing media instead of searching for upgrades. The tag-rotation system and unattended mode continue to work as normal, scoped to the active filter set.

As a second part of this change, fix unattended mode's tag-clearing logic so it correctly scopes to items matching **all** active filters on the instance — not just the monitored flag as it does today.

---

## Scope

- All four app types: Radarr, Sonarr, Lidarr, Readarr.
- No schema migration required — new field is optional and defaults to absent (treated as `false`).
- No database changes.

---

## Section 1: Config Model

### Change

Add `missingOnly: z.boolean().optional()` to all four instance schemas in `shared/src/schemas/config.ts`:

```
radarrInstanceSchema
sonarrInstanceSchema
lidarrInstanceSchema
readarrInstanceSchema
```

Types in `shared/src/types/config.ts` are inferred from schemas via `z.infer<>` — no manual update needed.

### Behaviour

- When absent or `false`: existing upgrade-search behaviour is unchanged.
- When `true`: after all existing filters (monitored, tag, quality profile, status) are applied, keep only items where `hasFile === false`.

### Backward compatibility

`z.boolean().optional()` makes the field `undefined` when absent. All code reads it with a `?? false` guard. Existing `config.json` files without this field are valid and unaffected.

---

## Section 2: Backend — Filtering & Unattended Mode

### 2a. `FilterableMedia` interface (`backend/src/utils/filterUtils.ts`)

Add `hasFile?: boolean` to `FilterableMedia`. This field is already present on `SonarrEpisode` and `RadarrMovie`; it needs to be added to the `LidarrArtist` and `ReadarrAuthor` shapes too, populated from the Lidarr/Readarr API response (an artist/author "has a file" if they have at least one track/book file).

### 2b. `CommonFilterConfig` + `applyCommonFilters` (`backend/src/utils/filterUtils.ts`)

Add `missingOnly?: boolean` to `CommonFilterConfig`.

In `applyCommonFilters`, append a final filter step:

```typescript
if (config.missingOnly) {
  filtered = filtered.filter(m => m.hasFile === false);
}
```

Pass `missingOnly: (config as any).missingOnly` from `filterMediaItems` in `BaseStarrService`, alongside the existing `monitored`, `tagName`, etc. Also add `missingOnly` to the filter log object in `filterMediaItems` so it appears in debug output alongside the other active filters.

### 2c. Lidarr / Readarr `hasFile` population

Add `statistics?: { trackFileCount?: number }` to `LidarrArtist` in `lidarrService.ts`.  
Add `statistics?: { bookFileCount?: number }` to `ReadarrAuthor` in `readarrService.ts`.

Then set `hasFile` from these fields:

```typescript
// lidarrService.ts — in getMedia
hasFile: (artist.statistics?.trackFileCount ?? 0) > 0

// readarrService.ts — in getMedia
hasFile: (author.statistics?.bookFileCount ?? 0) > 0
```

**Radarr:** The Radarr API returns `hasFile: boolean` natively on the movie object and `fetchMediaWithScores` passes it through as-is. No transformation is needed — simply add `hasFile?: boolean` to the `RadarrMovie` interface:

```typescript
export interface RadarrMovie extends FilterableMedia {
  title: string;
  hasFile?: boolean; // natively present in Radarr API response
}
```

**Sonarr:** `SonarrEpisode` already carries `hasFile: boolean` directly from the episode API response — no change needed.

**DB cache concern:** The DB cache `has_file` column is derived in `mediaFileUtils.ts` (`extractFileInfoForDb`), which currently checks for embedded `trackFiles`/`bookFiles` arrays. The Lidarr `/api/v1/artist` and Readarr `/api/v1/author` list endpoints return `statistics.trackFileCount`/`statistics.bookFileCount` at the top level — not embedded file arrays. This means every Lidarr artist and Readarr author will sync to the DB with `has_file = 0`, making the `missingOnly` filter a no-op on those app types when served from cache.

**Required fix in `mediaFileUtils.ts`:** Add a `statistics?` field check in `extractFileInfoForDb` as a fallback for Lidarr/Readarr after the existing array checks:

```typescript
// If no file arrays present, fall back to statistics counts
if (!hasFile && item.statistics) {
  hasFile = (item.statistics.trackFileCount ?? item.statistics.bookFileCount ?? 0) > 0;
}
```

**DB cache path — `has_file` mapping:** The `processAppInstances` mapping from DB rows to `preloadedMedia` in `search.ts` must coerce the SQLite integer to a boolean (SQLite stores `0`/`1`; strict equality `=== false` requires an actual boolean):

```typescript
hasFile: !!m.has_file,  // coerce SQLite integer 0/1 to boolean
```

### 2d. Unattended mode fix (`backend/src/routes/search.ts`)

**Current behaviour (bug):** when `filtered.length === 0`, the tag-clear step finds items to un-tag by filtering `allMedia` with only `m.monitored === processor.config.monitored`. This misses quality profile, status, and now `missingOnly`.

**Fix:** replace the ad-hoc filter with a temporary invocation of `processor.filterMedia` on a version of `allMedia` where the tag exclusion is bypassed. Practically, this means:

1. Strip the `tagName` from each item's `tags` array in a temporary copy of `allMedia`.
2. Call `processor.filterMedia(processor.config, tempAllMedia)` to get all items that pass every filter.
3. From that result, keep only items whose original `tags` include `tagName`.
4. Un-tag those items, update DB, then re-fetch and re-filter as today.

This ensures unattended mode clears tags from exactly the items in the active filter set, regardless of which filters are enabled.

---

## Section 3: Frontend

### 3a. `InstanceCard` toggle (`frontend/src/components/InstanceCard.tsx`)

Add a "Missing Only" `Switch` control below (or near) the existing "Monitored Only" toggle. Pattern is identical:

```tsx
<Flex align="center" gap="2">
  <Switch
    checked={instance.missingOnly ?? false}
    onCheckedChange={(checked) =>
      updateInstanceConfig(appType, instance.id, 'missingOnly', checked)
    }
  />
  <Text size="2">Missing Only</Text>
</Flex>
```

Applies to all four app types — no conditional rendering by app.

### 3b. Advanced tab — unattended mode description (`frontend/src/pages/Settings.tsx`)

Update the description text to accurately reflect the fixed behaviour:

> **Before:** "When all eligible media has been searched, automatically removes the tracking tag and starts a new cycle."  
> **After:** "When all eligible media matching the instance's active filters has been searched, automatically removes the tracking tag from those items and starts a new cycle. Works with all filter combinations including Missing Only."

(Exact wording may differ; the key additions are: "matching the instance's active filters" and "from those items".)

---

## Data Flow Summary

```
Search run triggered
  └─ processApplication(processor, cachedMedia)
       ├─ filterMedia(config, allMedia)         ← includes missingOnly filter
       ├─ filtered.length === 0 AND unattended?
       │    ├─ build tempMedia (tag stripped)
       │    ├─ filterMedia(config, tempMedia)   ← same filter path, finds tagged items
       │    ├─ removeTag from filtered tagged items
       │    ├─ update DB tags
       │    └─ re-fetch + re-filter
       └─ randomSelect → searchMedia → addTag → updateDB
```

---

## Files Changed

| File | Change |
|------|--------|
| `shared/src/schemas/config.ts` | Add `missingOnly` to all four instance schemas |
| `backend/src/utils/filterUtils.ts` | Add `hasFile?` to `FilterableMedia`; add `missingOnly` to `CommonFilterConfig` and `applyCommonFilters` |
| `backend/src/services/baseStarrService.ts` | Pass `missingOnly` from config into `applyCommonFilters` |
| `backend/src/services/radarrService.ts` | Explicitly map `hasFile` on `RadarrMovie` from API response |
| `backend/src/services/lidarrService.ts` | Add `statistics?` to `LidarrArtist`; populate `hasFile` |
| `backend/src/services/readarrService.ts` | Add `statistics?` to `ReadarrAuthor`; populate `hasFile` |
| `backend/src/routes/search.ts` | Map `has_file` from DB row in `preloadedMedia`; fix unattended tag-clear to use full filter chain |
| `backend/src/utils/mediaFileUtils.ts` | Add `statistics.trackFileCount`/`bookFileCount` fallback for Lidarr/Readarr `has_file` derivation (if needed) |
| `frontend/src/components/InstanceCard.tsx` | Add Missing Only `Switch` |
| `frontend/src/pages/Settings.tsx` | Update unattended mode description |
