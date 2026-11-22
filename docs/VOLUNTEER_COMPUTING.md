# Volunteer computing

**Decision (2026-11-15): contribute through BOINC rather than run our own workload.**

This app runs no computations itself. Settings → *Volunteer computing · BOINC* helps the user
install [BOINC](https://boinc.berkeley.edu) (the open-source platform behind SETI@home) and choose
what to support:

- [climateprediction.net](https://main.cpdn.org/) (University of Oxford climate modelling), the
  closest match to this project's subject.
- [Science United](https://scienceunited.org/) (added 2026-11-22), run by the BOINC team at UC
  Berkeley. Volunteers pick science areas (environmental science among them) and Science United
  assigns their computer to projects. This matters because climateprediction.net has most of its
  work for 64-bit Linux, so a Mac or Windows computer attached only to it often sits idle.

Any BOINC project works. BOINC computes while the computer is idle, which is when the screensaver
is showing.

**Volunteering without a computer:** the CoCoRaHS layer (2026-11-22) shows daily rain reports from
volunteers who read a rain gauge every morning, and the Settings panel links to joining CoCoRaHS.
That is crowdsourced *data*, which this project displays but does not collect.

How it works:
- The native shell (`src-tauri/src/boinc.rs`) talks to BOINC's GUI RPC on `127.0.0.1:31416`. It uses
  only read-only requests (`exchange_versions`, `get_simple_gui_info`, `get_cc_status`) that BOINC
  answers for local clients without a password.
- It never reads BOINC's password file, attaches or detaches projects, or changes BOINC settings.
  Nothing is sent off the machine.
- Settings shows BOINC's state, its projects, running and waiting tasks, the credit each project
  has granted this computer, and why BOINC has paused work when it says so (its
  `task_suspend_reason`, e.g. "the computer is in use"). An optional status-bar line, on by default and shown only when BOINC is
  running an active project, gives a one-line summary in the saver.
- Credit is BOINC's own measure of validated work. We show it as reported and never convert it into
  "impact" claims.
- climateprediction.net currently has the most work for 64-bit Linux. The panel says so, because
  Mac and Windows computers may get tasks only some of the time.
- Not available in the browser build or the native macOS `.saver`, which have no native shell. Both
  show only the visualization.

The rest of this document explains why we didn't build our own distributed task. That reasoning
still holds.

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

Until a task of our own clears the bar, BOINC is the honest way to contribute.
