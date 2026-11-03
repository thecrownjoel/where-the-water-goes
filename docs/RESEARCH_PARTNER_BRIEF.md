# Research partner brief (draft)

*For hydrology groups at universities and agencies. This project has no relationship with, or endorsement from, USGS, NOAA, NASA or any university.*

## What it is

An open-source (Apache-2.0) desktop visualization and screensaver that shows public U.S. water observations on a 3D globe. It is built so the public can see where measurements come from, how current they are, and what their limitations are.

## What we can offer a partner

- **Reach:** a public-facing visualization showing the national stream-gauge network with honest provenance. Provisional status, qualifiers, and observation vs. retrieval time are always visible.
- **Reproducibility:** every bundled dataset is rebuilt by scripts, with hashed outputs; the parsing and fallback logic is unit-tested; the source registry lists everything we could not verify.
- **A distribution channel for validated results:** a future layer could show a partner's published, peer-reviewed products (for example per-gauge NWM skill, or SWOT-vs-gauge lake comparisons), clearly labelled with their status.

## What we are looking for

1. Advice on a **SWOT-vs-gauge lake-level comparison**: datum conversion (ellipsoid/geoid vs. NAVD88 and local gauge datums) and quality filtering.
2. Feedback on whether a **distributed volunteer workload** exists in your research that meets the bar in [VOLUNTEER_COMPUTING.md](VOLUNTEER_COMPUTING.md). We will not invent one.
3. Review of how we label provisional, estimated and model data.

## What we will never do

Claim endorsement, present model output or experimental results as official measurements, or present the app as a forecast or warning service.
