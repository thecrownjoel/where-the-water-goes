# Data sources

The code version of this registry, also shown in the app's About panel, is `src/data/registry.ts`.

Statuses:
- **Verified**: checked against a live endpoint or official documentation on 2026-11-01.
- **Verify before implementation**: could not be confirmed.

## USGS Water Data OGC API — latest discharge (active)

| | |
|---|---|
| Agency | U.S. Geological Survey |
| Endpoint | `https://api.waterdata.usgs.gov/ogcapi/v1/collections/latest-continuous/items?parameter_code=00060&f=json&limit=50000&properties=monitoring_location_id,time,value,unit_of_measure,approval_status,qualifier` (verified) |
| Response | GeoJSON FeatureCollection, no `next` link at this limit. 14,263 features, 7.0 MB raw / 0.78 MB gzipped (verified) |
| Fields used | `monitoring_location_id`, `time` (ISO 8601 UTC), `value` (**a string**), `unit_of_measure` (`ft^3/s`), `approval_status` (`Provisional`/`Approved`), `qualifier` (comma-separated or null), Point geometry in CRS84 (verified) |
| Cadence | Mostly 15-minute values. The app refetches at most every 60 minutes |
| Auth | None. An optional api.data.gov key raises limits. **No key is shipped in the client** |
| Rate limits | Per IP per hour; HTTP 429 when exceeded. Exact numbers are not published (**verify before implementation**) |
| CORS | `access-control-allow-origin: *` (verified) |
| Terms | USGS-authored data are U.S. public domain |
| Attribution | "U.S. Geological Survey, Water Data for the Nation" |
| Docs | https://api.waterdata.usgs.gov/docs/ogcapi/ · https://www.usgs.gov/tools/usgs-water-data-apis · https://waterdata.usgs.gov/provisional-data-statement/ |

**How we handle it** (`src/data/usgs.ts`):
- Values are kept exactly as published. Negative values are valid at tidal sites.
- Records are rejected, with the count per reason shown in About, when the value is missing or non-numeric, the unit is unexpected, the ID is invalid, the coordinates are bad, the time is in the future, or the time is more than 48 h old ("stale").
- On 2026-11-01, 5,192 of the 14,263 "latest" records were stale, from discontinued sites.
- `ESTIMATED` qualifiers make a reading an *estimate*, drawn as a hollow ring. All other qualifiers are listed on the gauge card.
- If a site has more than one discharge series, the most recent one is kept.

**Limitations:**
- Most values are provisional and may be revised.
- Gauge density reflects the monitoring network, not the amount of water.
- Discharge is shown on a log scale with no comparison to "normal". Percentiles need daily statistics, which are not implemented yet, so we don't imply them.
- The format of links to individual site pages (`waterdata.usgs.gov/monitoring-location/USGS-…/`) could not be checked automatically (**verify before implementation**).

### Additional layers from the same endpoint (active, verified 2026-11-02)

Each layer is a separate request with its own provenance, cache entry and rules (`src/data/layers.ts`). Parameter descriptions are quoted from the USGS `parameter-codes` collection. `parameter_code` accepts a comma-separated list (verified).

| Layer | Codes | Unit | 2026-11-02 response | Staleness cut | Refetch | Live-mode fallback |
|---|---|---|---|---|---|---|
| Discharge | 00060 "Discharge, cubic feet per second" | `ft^3/s` | 14,263 features | 48 h | 60 min | cache ≤ 7 days, then archived snapshot |
| Rain at gauges | 00045 "Precipitation, total, inches" | `in` | 3,533 features, 1.7 MB; ~2,570 current; ~70 non-zero | **2 h** | 30 min | cache ≤ 2 h, otherwise **hidden** |
| Lake & reservoir levels | 62614 "…water surface elevation above NGVD 1929, feet", 62615 "…above NAVD 1988, feet" | `ft` | 669 features; ~570 current | 48 h | 60 min | cache ≤ 7 days, otherwise **hidden** |

**Rain — what the number means:**
- 00045 is the total for the gauge's *latest reporting interval*. The record does not say how long that interval is.
- A sample of the `continuous` collection (6 h, 1,669 sites) showed intervals of mostly 15 min (1,197 sites) or 5 min (334), with some 30–60 min.
- We therefore show *where rain was recorded in the latest interval*, sized by √inches. We don't sum, rank or compare amounts between gauges, and dry gauges are not drawn.
- Building a true 1-hour or 6-hour total would mean paging the `continuous` collection: about 18 MB per 50,000 rows and several pages for 6 h. That's too heavy for an hourly screensaver fetch.
- Archived rain is never shown in live mode, because an old storm drawn on today's globe would mislead. Negative precipitation is rejected, not clamped.

**Lake levels — what the number means:**
- The water-surface elevation above a stated vertical datum. It is not depth, and not comparable between lakes.
- All markers are the same size, and the datum is printed with every value.
- No "percent full" is shown: that would need storage-capacity curves we don't have.

**Site IDs:** some rain gauges belong to cooperating agencies and use IDs like `MO005-394156092030201`. The ID check accepts digits in the agency prefix.

**Legacy API:** `waterservices.usgs.gov` (IV/DV) still answered on 2026-11-01. USGS says it retires in Q1 2027. We do not use it.

## NOAA ETOPO1 (bundled)

| | |
|---|---|
| Agency | NOAA NCEI (formerly NGDC) |
| Retrieval | NOAA CoastWatch ERDDAP `etopo180`, every 10th node (0.1667°, 2161×1081), ESRI ASCII. See `scripts/fetch-basemap-sources.mjs` |
| License | "May be used and redistributed for free but is not intended for legal use… no warranty" (from the dataset's ERDDAP metadata) |
| Citation | Amante, C. and B. W. Eakins (2009). ETOPO1 1 Arc-Minute Global Relief Model. NOAA Technical Memorandum NESDIS NGDC-24 |
| Use | Relief shading, bathymetry colour, river flow-direction inference |
| Note | ETOPO 2022 supersedes ETOPO1; migrating is a to-do |

## Natural Earth (bundled, not federal)

- Land (1:50m), lakes and reservoirs (1:10m), rivers (1:10m plus the North America supplement).
- Public domain. Credit: "Made with Natural Earth."
- **Flow direction is not in the source data.** `orientNetwork()` in `src/geo/geometry.mjs` infers it:
  1. Join line endpoints to nearby vertices of other lines within 0.005°, splitting lines at confluences.
  2. Treat coastal end nodes (≤ 5 m elevation, from ETOPO1) as outlets. A network with none uses its lowest end node.
  3. Orient each segment toward the outlet by network distance.
- Spot checks: the Ohio, Nile and Danube point toward their mouths. Every remaining "wrong-way" segment we checked on the Mississippi turned out to be correct on the ground: the headwaters flow north first, and the delta's distributaries fan out.
- Expect local errors on flat or braided reaches.
- **The river animation is cartographic. It does not show measured or modeled flow.**

## NASA SWOT via Hydrocron (planned)

- Endpoint: `https://soto.podaac.earthdatacloud.nasa.gov/hydrocron/v1/timeseries`. It answered anonymously (verified).
- Version D is the default collection. Responses are capped at 6 MB.
- Fields include `wse`, `width`, `reach_q`, `dark_frac` and `time_str`, each with a matching `*_units` field.
- Unfiltered width jumps by about 100× between quality classes, so `reach_q` filtering is mandatory.
- Latency from observation to availability was about 3–6 days in our checks; no official figure was found.
- **Verify before implementation:** rate limits or an API key, collection DOIs, and whether Version D is validated or provisional.

## NOAA National Water Model v3.1 (planned)

- Operational since about 2026-08-18.
- Available from `s3://noaa-nwm-pds` (anonymous) and from NOMADS.
- CONUS `channel_rt` NetCDF files are about 12.4 MB each.
- `feature_id` is essentially the NHDPlus V2 COMID.
- It is **model guidance, not observation, and not an official forecast.** Official river forecasts come from the NWS River Forecast Centers.
- The retrospective archive (`s3://noaa-nwm-retrospective-3-0-pds`, 1979–2023, Zarr) has no use restrictions.

## Excluded

- **OPERA DSWx-HLS, NASA HLS:** need Earthdata Login, and each user must use their own credentials.
- **Landsat Collection 2 on AWS:** the bucket is requester-pays.

An official water-extent product already exists (DSWx), so a volunteer workload recomputing it would duplicate agency work.
