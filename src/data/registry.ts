// Data-source registry: every dataset the app displays or bundles, with how it is obtained,
// its terms, and its verification status. Shown verbatim in the About panel and mirrored in
// docs/DATA_SOURCES.md. Facts marked `verify` were not confirmed from official documentation
// at the time of writing and must be checked before relying on them.

export type SourceStatus =
  | 'active' //     used by this build
  | 'bundled' //    shipped inside the app as static data
  | 'planned' //    researched, not yet implemented
  | 'excluded'; //  researched and deliberately not used (reason given)

export interface DataSource {
  id: string;
  agency: string | null;
  dataset: string;
  access: string;
  cadence: string;
  format: string;
  auth: string;
  terms: string;
  attribution: string;
  kind: 'observation' | 'model' | 'basemap' | 'satellite';
  status: SourceStatus;
  limitations: string[];
  docs: string[];
  /** Facts that still need confirmation from official documentation. */
  verify?: string[];
}

export const USGS_LATEST_CONTINUOUS_URL =
  'https://api.waterdata.usgs.gov/ogcapi/v1/collections/latest-continuous/items';

export const PROVISIONAL_STATEMENT_URL = 'https://waterdata.usgs.gov/provisional-data-statement/';

export const SOURCES: DataSource[] = [
  {
    id: 'usgs-latest-continuous',
    agency: 'U.S. Geological Survey (USGS)',
    dataset: 'Water Data OGC API — latest-continuous: 00060 discharge, 00045 precipitation, 62614/62615 lake & reservoir elevation',
    access: `${USGS_LATEST_CONTINUOUS_URL}?parameter_code=<codes>&f=json (one request per layer, all sites)`,
    cadence: 'Most sites report every 5–15 minutes. This app requests discharge and lake levels at most hourly, precipitation at most every 30 minutes.',
    format: 'GeoJSON FeatureCollection; value is a string; time ISO 8601 UTC',
    auth: 'None required. Optional api.data.gov key raises limits; no key is shipped in the client.',
    terms: 'USGS-produced data are U.S. public domain.',
    attribution: 'U.S. Geological Survey, Water Data for the Nation.',
    kind: 'observation',
    status: 'active',
    limitations: [
      'Most recent data are provisional and subject to revision (see USGS Provisional Data Statement).',
      '"latest" includes discontinued sites whose last value can be years old; this app hides values older than 48 hours.',
      'Qualifier codes (ICE, BACKWATER, ESTIMATED, EQUIP, …) indicate affected values and are shown, not hidden.',
      'Negative discharge is valid at tidally affected sites.',
      'Precipitation (00045) is the total for each gauge\'s latest reporting interval, whose length is not stated in the record (observed: mostly 5 or 15 minutes, some 30–60). Values are not summed or compared across gauges. Values older than 2 hours are hidden.',
      'Lake and reservoir elevations are above NGVD 29 (62614) or NAVD 88 (62615). They are not depths and are not comparable between lakes; the datum is always shown with the value.',
      'Some rain gauges are operated by cooperating agencies and served by USGS (site ids such as MO005-…).',
    ],
    docs: [
      'https://api.waterdata.usgs.gov/docs/ogcapi/',
      'https://www.usgs.gov/tools/usgs-water-data-apis',
      PROVISIONAL_STATEMENT_URL,
    ],
    verify: ['Exact anonymous rate limits are not published (per-IP, hourly; HTTP 429 when exceeded).'],
  },
  {
    id: 'noaa-etopo1',
    agency: 'NOAA National Centers for Environmental Information (formerly NGDC)',
    dataset: 'ETOPO1 Global Relief Model (ice surface), decimated to 0.1667°',
    access: 'NOAA CoastWatch ERDDAP griddap "etopo180" (build time only; bundled)',
    cadence: 'Static',
    format: 'Int16 grid (bundled as elevation.bin)',
    auth: 'None',
    terms: 'Free use and redistribution; not intended for legal use; no warranty.',
    attribution:
      'Amante, C. and B. W. Eakins (2009), ETOPO1 1 Arc-Minute Global Relief Model. NOAA Tech. Memo. NESDIS NGDC-24.',
    kind: 'basemap',
    status: 'bundled',
    limitations: ['Decimated ~18 km grid: used for shading and flow-direction inference only.'],
    docs: ['https://www.ncei.noaa.gov/products/etopo-global-relief-model'],
    verify: ['ETOPO 2022 supersedes ETOPO1; consider migrating.'],
  },
  {
    id: 'natural-earth',
    agency: null,
    dataset: 'Natural Earth 1:50m land, 1:10m lakes and rivers (+ North America supplement)',
    access: 'github.com/nvkelso/natural-earth-vector (build time only; bundled)',
    cadence: 'Static',
    format: 'Simplified, quantized JSON',
    auth: 'None',
    terms: 'Public domain.',
    attribution: 'Made with Natural Earth.',
    kind: 'basemap',
    status: 'bundled',
    limitations: [
      'Not a federal dataset; used as a cartographic basemap only.',
      'Flow direction is not in the source; inferred from network topology and ETOPO1 elevation. Can be wrong locally.',
      'River animation is cartographic. It does not represent measured or modeled flow.',
    ],
    docs: ['https://www.naturalearthdata.com/about/terms-of-use/'],
  },
  {
    id: 'nasa-swot-hydrocron',
    agency: 'NASA / CNES (via NASA PO.DAAC)',
    dataset: 'SWOT L2 HR RiverSP / LakeSP Version D via Hydrocron time-series API',
    access: 'https://soto.podaac.earthdatacloud.nasa.gov/hydrocron/v1/timeseries',
    cadence: '21-day repeat orbit; ~3–6 day latency observed (no official figure found)',
    format: 'JSON wrapping CSV or GeoJSON; fields such as wse, width, reach_q, dark_frac',
    auth: 'None observed for Hydrocron. Granule downloads require Earthdata Login.',
    terms: 'NASA Earth science data: open, no restrictions; citation requested.',
    attribution: 'Use the collection DOI/citation from the PO.DAAC landing page.',
    kind: 'satellite',
    status: 'planned',
    limitations: [
      'Quality flags must be filtered (reach_q, dark_frac): unflagged widths can jump by 100×.',
      'Heights are ellipsoidal/geoid-referenced; comparing with gauge datums requires conversion.',
    ],
    docs: ['https://podaac.github.io/hydrocron/'],
    verify: ['Rate limits / optional API key', 'Collection DOIs', 'Validated vs provisional status of Version D'],
  },
  {
    id: 'noaa-nwm',
    agency: 'NOAA Office of Water Prediction / NWS',
    dataset: 'National Water Model v3.1 (operational since Aug 2026) — channel_rt',
    access: 's3://noaa-nwm-pds (anonymous), NOMADS',
    cadence: 'analysis_assim hourly; short_range hourly (18 h)',
    format: 'NetCDF (~12.4 MB per CONUS channel_rt file); feature_id ≈ NHDPlus V2 COMID',
    auth: 'None',
    terms: 'NOAA open data; attribute, do not imply endorsement.',
    attribution: 'NOAA National Water Model.',
    kind: 'model',
    status: 'planned',
    limitations: [
      'Model guidance, not observation and not an official forecast; official river forecasts come from NWS River Forecast Centers.',
      'NetCDF parsing in the client and reach geometry (hydrofabric) are required.',
    ],
    docs: ['https://water.noaa.gov/about/nwm', 'https://registry.opendata.aws/noaa-nwm-pds/'],
    verify: ['Retention on each channel', 'feature_id/COMID correspondence for v3.1'],
  },
  {
    id: 'opera-dswx-hls',
    agency: 'NASA JPL OPERA (via PO.DAAC)',
    dataset: 'OPERA L3 Dynamic Surface Water Extent (DSWx-HLS)',
    access: 'Earthdata Login required',
    cadence: 'Global, 30 m, 2016–present',
    format: 'Cloud-optimized GeoTIFF',
    auth: 'Earthdata Login (per-user). Cannot be embedded in a desktop client.',
    terms: 'NASA open data.',
    attribution: 'OPERA DSWx-HLS, NASA JPL.',
    kind: 'satellite',
    status: 'excluded',
    limitations: [
      'Excluded as a volunteer workload: this official product already maps surface-water extent; recomputing it would duplicate agency work.',
    ],
    docs: ['https://www.jpl.nasa.gov/go/opera'],
  },
];

export function sourceById(id: string): DataSource | undefined {
  return SOURCES.find((s) => s.id === id);
}
