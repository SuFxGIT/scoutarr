# Filter Dialog & Clear Button — Design Spec

**Date:** 2026-03-21  
**Status:** Approved

---

## Summary

Replace the existing `Popover` filter panel in the Media Library dashboard with a Radix UI Themes `Dialog`, and add a "Clear" button inside it to reset all popup-layer filters at once.

---

## Scope

**In scope:**
- Convert `Popover.Root / Popover.Trigger / Popover.Content` to `Dialog.Root / Dialog.Content` for the filter panel in `MediaLibraryCard.tsx`
- Add a `filterDialogOpen: boolean` state to control the dialog
- Add a "Clear" button inside the dialog footer (conditionally visible when any filter is active)
- Add a "Done" button inside the dialog footer to close it
- Remove `Popover` import if no longer used elsewhere in the file

**Out of scope:**
- Column header filters (Title, Quality Profile, CF Score, Tags, Searched, Imported) — unchanged
- Filter persistence / localStorage
- Filter badge indicators on the trigger button beyond the existing blue-color signal

---

## Affected Files

- `frontend/src/components/MediaLibraryCard.tsx` — only file modified

---

## State Changes

Add one new piece of state:

```typescript
const [filterDialogOpen, setFilterDialogOpen] = useState(false);
```

No changes to existing filter states (`showMonitoredOnly`, `showMissingOnly`, `showUpgradedOnly`, `statusFilter`, `episodeMode`).

---

## Trigger Button

The existing button remains identical in appearance and position:

```tsx
<Button
  size="2"
  variant="ghost"
  color={filtersActive ? 'blue' : 'gray'}
  radius="full"
  aria-label="Filters"
  onClick={() => setFilterDialogOpen(true)}
>
  <MixerHorizontalIcon />
  Apply Filters
</Button>
```

The `filtersActive` derivation is unchanged:
```typescript
const filtersActive = showMonitoredOnly || showMissingOnly || showUpgradedOnly || (isSonarr && episodeMode) || statusFilter !== 'all';
```

---

## Dialog Structure

```tsx
<Dialog.Root open={filterDialogOpen} onOpenChange={setFilterDialogOpen}>
  <Dialog.Content maxWidth="320px">
    <Dialog.Title>Filters</Dialog.Title>

    <Flex direction="column" gap="3">
      {/* Monitored Only */}
      <Flex align="center" justify="between" gap="4">
        <Text size="2">Monitored Only</Text>
        <Switch size="1" checked={showMonitoredOnly} onCheckedChange={setShowMonitoredOnly} />
      </Flex>

      {/* Missing Only */}
      <Flex align="center" justify="between" gap="4">
        <Text size="2">Missing Only</Text>
        <Switch size="1" checked={showMissingOnly} onCheckedChange={setShowMissingOnly} />
      </Flex>

      {/* Upgraded Only */}
      <Flex align="center" justify="between" gap="4">
        <Text size="2">Upgraded Only</Text>
        <Switch size="1" checked={showUpgradedOnly} onCheckedChange={setShowUpgradedOnly} />
      </Flex>

      {/* Status */}
      <Flex align="center" justify="between" gap="4">
        <Text size="2">Status</Text>
        <Select.Root size="1" value={statusFilter} onValueChange={setStatusFilter}>
          <Select.Trigger style={{ minWidth: '110px' }} />
          <Select.Content position="popper" sideOffset={5}>
            <Select.Item value="all">Any Status</Select.Item>
            {statusOptions.map(s => (
              <Select.Item key={s} value={s}>{formatStatus(s)}</Select.Item>
            ))}
          </Select.Content>
        </Select.Root>
      </Flex>

      {/* Sonarr-only: View Mode */}
      {isSonarr && (
        <>
          <Separator size="4" />
          <Flex direction="column" gap="2">
            <Text size="2">View Mode</Text>
            <SegmentedControl.Root
              size="1"
              value={episodeMode ? 'episodes' : 'series'}
              onValueChange={(value) => setEpisodeMode(value === 'episodes')}
            >
              <SegmentedControl.Item value="series">Series</SegmentedControl.Item>
              <SegmentedControl.Item value="episodes">Episodes</SegmentedControl.Item>
            </SegmentedControl.Root>
          </Flex>
        </>
      )}
    </Flex>

    {/* Footer */}
    <Flex mt="4" justify="between" align="center">
      {filtersActive && (
        <Button
          size="2"
          variant="ghost"
          color="red"
          onClick={() => {
            setShowMonitoredOnly(false);
            setShowMissingOnly(false);
            setShowUpgradedOnly(false);
            setStatusFilter('all');
            setEpisodeMode(false);
          }}
        >
          Clear
        </Button>
      )}
      <Dialog.Close asChild>
        <Button size="2" ml="auto">Done</Button>
      </Dialog.Close>
    </Flex>

  </Dialog.Content>
</Dialog.Root>
```

---

## Filter Behavior

- All filter controls apply **live** — the grid updates immediately as the user toggles switches or changes the dropdown, while the dialog stays open.
- Closing the dialog (Done, Escape, backdrop click) does **not** reset filters.
- "Clear" resets only the popup-layer filters: `showMonitoredOnly`, `showMissingOnly`, `showUpgradedOnly`, `statusFilter`, `episodeMode`. Column header filters are unaffected.
- "Clear" is only rendered when `filtersActive` is true.
- When `selectedInstance` changes while the dialog is open, close the dialog by setting `filterDialogOpen` to `false`. This is implemented via a `useEffect` watching `selectedInstance`.

---

## Import Changes

- Add `Dialog` to the `@radix-ui/themes` import.
- Remove `Popover` from the import if it is no longer used elsewhere in `MediaLibraryCard.tsx`.

---

## No Backend Changes

This is a purely frontend UI change. No API calls, routes, or shared types are affected.
