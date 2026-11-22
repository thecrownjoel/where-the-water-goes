# Architecture

```
┌─────────────────────────── shared web frontend (TypeScript) ───────────────────────────┐
│                                                                                         │
│  src/data/          ingestion — no DOM, no three.js, fully unit-tested                  │
│    registry.ts      every source: endpoint, terms, attribution, limits, unverified facts│
│    layers.ts        point layers: discharge, rain, lake level, groundwater (USGS) and   │
│                     CoCoRaHS daily rain — each with its own source, cache, staleness,   │
│                     refetch and fallback rules                                          │
│    usgs.ts          request builder + strict multi-parameter parser (rejects & counts)  │
│    cocorahs.ts      CoCoRaHS CSV export: request dates, parser, coordinate rounding     │
│    fetcher.ts       JSON/text fetch: timeouts, bounded retries, Retry-After, size cap   │
│    cache.ts         IndexedDB / memory store, expiry purge                              │
│    provider.ts      live → cached → archived decision, provenance on every snapshot     │
│    archive.ts       compact format for the bundled archived snapshot                    │
│                                                                                         │
│  src/geo/geometry.mjs   simplification, quantization, flow-direction inference          │
│                         (shared with the Node build scripts)                            │
│  src/geo/aquifers.ts    principal-aquifer lookup (point in polygon), rock-type colours  │
│                                                                                         │
│  src/viz/           visualization — knows nothing about where data comes from           │
│    Globe.ts         relief/bathymetry shader, land & lake masks, aquifer tint, real sun │
│    Rivers.ts        instanced screen-space ribbons, downstream glints                   │
│    Gauges.ts        instanced marks in five styles (flow, rain, lake, well, daily rain) │
│    focus.ts         data-driven tour stop: busiest cluster of gauges recording rain     │
│    Coastlines.ts, Stars.ts                                                              │
│    Director.ts      GSAP camera tour; reduced-motion = fades, no flights                │
│    Scene.ts         renderer, bloom, frame pacing, quality                              │
│                                                                                         │
│  src/ui/            overlay, settings (validated), formatting (UTC, escaping)           │
│  src/volunteer/     BOINC status panel and status-bar line                              │
│  src/platform/      Tauri bridge; no-ops in a plain browser                             │
└─────────────────────────────────────────────────────────────────────────────────────────┘
                 │ invoke: exit_saver · power_state · open_external · boinc_status · diag
┌────────────────┴─────────── native shell (Rust, src-tauri/) ────────────────────────────┐
│  launch.rs   /s /c /p --saver --idle parsing (unit-tested)                              │
│  idle.rs     CoreGraphics / GetLastInputInfo / user-idle                                │
│  lib.rs      windows per monitor, macOS window level, tray, battery, https-only opener  │
│  boinc.rs    read-only BOINC GUI RPC on 127.0.0.1:31416 (unit-tested, mock client)     │
│  preview.rs  Windows /p thumbnail (GDI)                                                 │
└─────────────────────────────────────────────────────────────────────────────────────────┘
```

## Data flow

1. **Build time** (`scripts/`):
   - Raw public-domain sources are turned into `public/data/base/*` (about 9.5 MB) with a `manifest.json` recording the SHA-256 of each output and its provenance. `build-aquifers.mjs` adds the principal aquifers.
   - `build-demo-snapshot.ts` freezes a real response for each layer into `public/data/demo/` for demo/offline mode.
2. **Run time:**
   - The basemap loads from local files.
   - The provider loads each layer (`loadLayer`) in this order; the steps differ by layer only where `layers.ts` says so:
     1. *Demo mode* → archived snapshot.
     2. A cache entry newer than 60 min → used and labelled *cached*.
     3. Otherwise fetch from the source (USGS or CoCoRaHS) → *live*, then cached. Each layer has its own minimum refetch interval (30 min to 6 h), so nothing is fetched constantly.
     4. If the fetch fails → a cache entry up to 7 days old, labelled *cached*, with a notice.
     5. Otherwise → the archived snapshot, labelled *archived*, with a notice. Every layer except streamflow is **hidden** instead: an archived storm on today's globe would mislead.
3. Every snapshot carries `provenance` (source ID, retrieval time, exact request URL), `observedRange`, `mode` and parse `stats`. The UI always shows mode, observation time and retrieval time separately.

## Rules the code enforces

- **Value kinds:** `observation | estimate | model | experimental` (`src/data/types.ts`). Rendering and labels differ by kind.
- **Never fabricated:** a response with zero current readings is treated as a failure, never as "no water" (tested).
- **No interpolation:** nothing is interpolated between gauges. Rivers are not coloured by gauge values.
- **Archived data:** decoding always forces `mode: 'archived'` (tested).

## Testing

- `npm test` runs Vitest: the USGS parser against real records plus malformed cases, the CoCoRaHS parser against a fixture in the real export format, aquifer lookup against the bundled map, fetch retry and backoff, provider fallbacks, cache expiry, the archive round trip, flow-direction inference, solar position, settings validation, HTML escaping, and registry completeness.
- `cargo test` (in `src-tauri/`) covers launch-argument parsing and the BOINC RPC client (including a mock BOINC client on a local socket).
- `node scripts/screenshot.mjs` renders the dev server in headless Chrome for visual checks.
