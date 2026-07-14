# Image Index Overhaul Plan

## Problem Summary

Current yearly manifests at pictures/<year>/image_index.json include large global arrays, especially outfits.
That causes:

- Redundant data duplicated in every year file.
- Larger file size and slower parsing for each year load.
- Unclear ownership between year-scoped media and global media.
- Higher risk of drift and confusion when generators and consumers evolve.

## Current Behavior (Observed)

Generator behavior in tempscripts/generate_media_manifests.js:

- Builds one image_index.json per year folder.
- Injects globalOutfits into every year manifest as outfits.
- Injects globalGroups into every year manifest and merges with year groups.
- Injects life123 and locations globally into every year manifest.

Consumer behavior (high level):

- scripts/master_reference.js reads year manifest and also reads global manifests separately.
- scripts/ashford_location_map.js reads year manifest outfits.
- scripts/shared_media.js assumes manifest arrays and merges with directory listing.

This means global outfit duplication in yearly files is unnecessary for master reference and likely unnecessary for most consumers.

## Target Design (v2)

Split manifest responsibility into year-scoped and global-scoped files.

1. Year manifest (pictures/<year>/image_index.json)
- portraits: files under pictures/<year>/portraits
- groups: files under pictures/<year>/groups
- fieldMedia: files directly under pictures/<year>
- refs: pointer object for global categories
- generatedAt
- schemaVersion: 2

2. Global manifest (pictures/image_index.global.json)
- outfits: files under pictures/outfits
- groups: files under pictures/group
- life123: files under pictures/life123
- locations: files under pictures/locations
- roboter: files under pictures/Roboter (optional but recommended)
- generatedAt
- schemaVersion: 2

3. Optional category manifests kept for backward compatibility
- pictures/outfits/image_index.json
- pictures/group/image_index.json
- pictures/life123/image_index.json
- pictures/locations/image_index.json

## Compatibility Strategy

Use a non-breaking migration in phases.

Phase A (compatibility write)
- Keep writing current fields in yearly manifest.
- Add schemaVersion and refs.
- Add new global manifest.
- Consumers still work unchanged.

Phase B (dual read)
- Update readers to prefer v2 global manifest when present.
- Fallback to existing fields for old data.
- Add clear warnings when fallback path is used.

Phase C (dedupe write)
- Stop writing duplicated global outfits/groups/life123/locations into year files.
- Keep only year-local fields plus refs.

Phase D (cleanup)
- Remove fallback branches after one stable cycle.
- Simplify generators and readers.

## Proposed v2 Year Manifest Example

{
  "schemaVersion": 2,
  "year": "2027",
  "portraits": ["Jess.jpg", "Lina.jpg"],
  "groups": ["ivory.jpg"],
  "fieldMedia": ["Field.jpg"],
  "refs": {
    "global": "../image_index.global.json"
  },
  "generatedAt": "2026-04-01T00:00:00.000Z"
}

## Proposed v2 Global Manifest Example

{
  "schemaVersion": 2,
  "outfits": ["Ashley.jpg", "LinaStreamer.jpg"],
  "groups": ["sheetA.jpg"],
  "life123": ["jessandclint.jpg"],
  "locations": ["boonehome/ExteriorFront.jpg"],
  "roboter": ["unit01.jpg"],
  "generatedAt": "2026-04-01T00:00:00.000Z"
}

## Consumer Update Order

1. scripts/master_reference.js
- Prefer global manifest for global categories.
- Keep year manifest read only for year-local media.

2. scripts/ashford_location_map.js
- Read global outfits from global manifest.
- Keep fallback to year manifest outfits for compatibility.

3. scripts/shared_media.js
- Add support for schemaVersion 2 and refs/global manifest.
- Preserve support for old flat arrays.

## Generator Update Order

1. Update tempscripts/generate_media_manifests.js
- Emit image_index.global.json.
- Emit schemaVersion for yearly files.
- During phase A/B, keep old keys in year files.

2. Add validation checks
- Verify no duplicate files across normalized paths.
- Verify all listed files exist.
- Verify year manifests only contain year-local media once phase C starts.

## Acceptance Criteria

- Yearly image_index.json size drops significantly after dedupe phase.
- No regressions in master reference gallery loading.
- No regressions in ashford location map outfit resolution.
- No increase in 404 probes for media fetches.
- Generator can be run repeatedly with stable output ordering.

## Immediate Next Implementation Slice

- Implement Phase A in generator only.
- Add schemaVersion and refs to yearly manifests.
- Write pictures/image_index.global.json.
- Keep existing yearly fields for compatibility.

This gives a safe first commit with zero consumer break risk.
