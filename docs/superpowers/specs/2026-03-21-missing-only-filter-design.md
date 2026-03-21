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

Pass `missingOnly: (config as any).missingOnly` from `filterMediaItems` in `BaseStarrService`, alongside the existing `monitored`, `tagName`, etc.

### 2c. Lidarr / Readarr `hasFile` population

In `lidarrService.ts` `getMedia`, set `hasFile: !artist.statistics?.trackFileCount` (or equivalent field from the Lidarr API) on each `LidarrArtist`.  
In `readarrService.ts` `getMedia`, set `hasFile: !author.statistics?.bookFileCount` similarly.

The DB cache stores `has_file` — verify `mediaSync.ts` already syncs this field; if not, add it.

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
| `backend/src/services/lidarrService.ts` | Populate `hasFile` on `LidarrArtist` |
| `backend/src/services/readarrService.ts` | Populate `hasFile` on `ReadarrAuthor` |
| `backend/src/routes/search.ts` | Fix unattended tag-clear to use full filter chain |
| `frontend/src/components/InstanceCard.tsx` | Add Missing Only `Switch` |
| `frontend/src/pages/Settings.tsx` | Update unattended mode description |
