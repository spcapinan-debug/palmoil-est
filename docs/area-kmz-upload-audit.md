# Area KMZ Upload Audit

Audit date: 2026-08-10  
Base: `origin/main` at `c53ea3148df3c4a1b71a7b2e614fe5c8a71212c6`

## Current architecture

- Canonical Area identity is `public.blocks.id`. Active Area, Budget, Planning, Work Order and Dispatch paths consume the shared canonical block catalog; KMZ names are not business identifiers.
- `api/farm-area-master.js` authenticates the request, reads active `blocks`, `estates`, and `zones`, reads `webapp/data/block_map.json` from the deployment artifact, and calls `reconcileFarmAreaMap()` server-side.
- `lib/server/farm-area-map.js` performs exact matching only: `Placemark.name` -> `normalizeFarmBlockName()` -> `blocks.block_name` -> `blocks.id`. It normalizes Unicode dashes, whitespace, case, and repeated dashes while preserving the `-R` suffix. It does not fuzzy-match, AP-match, create, rename, delete, or mutate Blocks.
- `webapp/app.js` renders the reconciled map returned by the authenticated Area API. The standalone `loadBlockMapData()` static loader is bootstrap-only; the Area page replaces it with the authenticated response when available.
- Map failures are Area-module diagnostics and do not participate in login/session assertions. The Area table remains driven by `blocks` even when geometry is unavailable.

## Current data state

The counts below were derived on 2026-08-10 from the committed static artifact reconciled against the active Production canonical Block names with the same normalization rules.

| Metric | Current value |
| --- | ---: |
| Map source | `webapp/data/block_map.json` |
| Raw polygons | 101 |
| Unique normalized map keys | 101 |
| Matched canonical Blocks | 92 |
| KMZ without Master | 9 |
| Master without KMZ | 11 |
| Duplicate Placemark names | 0 |
| Duplicate canonical names | 0 |
| Geometry/master conflicts | 0 |
| Active canonical Blocks | 103 |

## Existing supporting infrastructure

- Supabase Storage already uses private buckets for other modules. Survey evidence has a server-only Storage REST helper and signed-upload/finalize flow in `api/farm-actions.js`; no Area-map bucket or shared Area Storage helper exists.
- The established authorization model is `roles` -> `role_permissions` -> `permissions`, loaded by `authenticate()` and enforced by `authorize()`. UI capabilities are derived from session permissions. No email allowlist is used.
- Existing management roles include `super_admin`, `director`, `manager`, and `uat_manager`. Area map management permissions do not yet exist.
- Existing `audit_logs` and `audit()` already capture actor, timestamp, action, entity, payload, IP, user agent, and reason. A second audit subsystem is unnecessary.
- There is no existing `area_map_versions` or `area_map_features` table and no `area-map-files` bucket.
- There are zero active `plot_groups` and no active Plot-to-Group links in the current data. Every active Block has a Plot, so the preferred hierarchy relation remains available when groups are configured later; until then, Block Group must be derived generically from canonical `block_name`.

## Required target architecture

- Keep `webapp/data/block_map.json` as immutable bootstrap/fallback only until a published version exists.
- Store raw and processed artifacts in the private `area-map-files` bucket at `raw/{versionId}/source.kmz` and `processed/{versionId}/block_map.json`.
- Store immutable version metadata and reconciliation summaries in `area_map_versions`. About 100 polygons do not justify an `area_map_features` row table; processed GeoJSON in private Storage is simpler and keeps geometry out of the exposed Data API.
- Browser calls authenticated Area-specific server APIs only. The server validates permissions, parses KMZ with strict ZIP/XML limits, reconciles against canonical Blocks, and writes Storage/metadata with the server credential. Browser code never receives the server credential and cannot write the table or bucket directly.
- Publish and rollback use database locking plus an atomic RPC so at most one row can be active/published. Rollback creates a new immutable version referencing/copied from a prior version; history is never overwritten.
- The active published version becomes the primary map source. If none exists, or a transient active-map read fails, the API falls back to the committed static artifact without affecting canonical Area reads or login.
- Polygon color comes from canonical Block Group identity: active Plot -> Plot Group first, otherwise a deterministic generic group derived from canonical `block_name`; null/unmatched/conflict styles remain neutral or warning styles.

## Migration decision

**Migration required: YES.**

An additive migration is required to create the metadata table, constrained status lifecycle, single-published guard, private server-only transaction functions, Area map permissions/role grants, and the private bucket record. No applied migration will be edited, no database reset is required, and no canonical Block data is changed.
