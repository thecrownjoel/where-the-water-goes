# Volunteer computing: why it is off

The settings show volunteer computing as **off and unavailable** in v0.1. That is deliberate.

## The bar a task must clear

A volunteer workload has to be:
1. scientifically useful to someone who isn't us;
2. genuinely in need of many machines;
3. deterministic and checkable by recomputation;
4. runnable without credentials in the client;
5. honest about what each contribution means.

## Candidates we evaluated

| Candidate | Useful? | Needs many machines? | Anonymous data? | Verdict |
|---|---|---|---|---|
| Water masks (MNDWI/AWEI) from HLS imagery, compared with OPERA DSWx and gauges | Weak. NASA OPERA DSWx and USGS DSWE already map water extent at 30 m | No. ~50–100 MB per tile, so download is the bottleneck, not compute | **No.** Earthdata Login, per user | Rejected |
| SWOT lake height vs. USGS lake/reservoir gauges | Yes. SWOT validation is active research | No. A few hundred lakes; under an hour on one laptop | Yes (Hydrocron + USGS) | Good one-off analysis, not a volunteer task |
| NWM retrospective v3.0 vs. USGS daily values (NSE/KGE/bias per gauge) | Moderately. Similar evaluations exist | No. Hours to a day on one machine | Yes (anonymous Zarr + USGS) | Best fit *if* a distributed task is ever justified |

## If the feature is built later

It would follow these rules:
- **Opt-in** and off by default. Limits on CPU/GPU share, pause on input, no work on battery, stop at any time.
- **Work units** are signed manifests naming a published algorithm version and the input URLs on agency servers. No downloaded code is ever executed: the algorithm ships in the app binary.
- **Validation:**
  - Each unit is computed by two or more independent volunteers, with outputs compared after deterministic rounding.
  - Results are spot-checked against a reference run on project hardware.
  - Results are compared with independent ground observations (USGS gauges).
- **Contribution receipt** shows units processed, accepted, rejected and pending. No inflated "impact" numbers.
- **Results** are labelled *experimental*, never official, and published with the code version needed to reproduce them.
- **Server:** a minimal Cloudflare Worker that accepts small signed result summaries, and nothing else.

Until a task clears the bar, the honest choice is to ship the visualization and the data explorer without it.
