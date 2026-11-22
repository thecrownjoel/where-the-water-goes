# Roadmap and open work

Where the project stands, and what's left, in priority order. Each item says what "done" means.
Items marked **(hardware)** or **(account)** can't be finished from code alone.

Status as of 2026-11-22 (v0.2.0).

## 1. Make the screensaver real on every OS

| # | Task | Done when | Notes |
|---|---|---|---|
| 1.1 | **macOS: run the `.saver` inside System Settings** (hardware) | [TESTING.md](TESTING.md) § macOS passes on macOS 14 or 15, and on 26 or 27 | Only tested in `macos-saver/harness` so far. Watch for the known `legacyScreenSaver` bugs (saver keeps running, duplicate instances, second monitor). |
| 1.2 | **macOS: Developer ID signing and notarization** (account) | A downloaded `.saver.zip` and `.dmg` open without a Gatekeeper warning | $99/year Apple Developer Program. Secrets are listed in RELEASING.md; CI signs automatically once they exist. Ad-hoc-signed builds run only on the machine that built them. |
| 1.3 | **Windows: install and run** (hardware) | TESTING.md § Windows passes on Windows 10 and 11 | The installer, the `.scr` in Screen Saver Settings, `/c`, `/p` and exit-on-input are all written but have never run on Windows. |
| 1.4 | **Windows: Authenticode signing** (account) | No "unknown publisher" warning | OV certificate or Azure Trusted Signing; see RELEASING.md. |
| 1.5 | **Linux: test the packages** (hardware) | TESTING.md § Linux passes on one X11 and one Wayland desktop | `.deb`, `.rpm`, AppImage and Flatpak are built by CI, untested. |
| 1.6 | **Linux: XScreenSaver hack mode** | `xscreensaver` can run it in its own window | Needs a design: Tauri can't embed its webview in another program's window. A small native wrapper around WebKitGTK might. |
| 1.7 | **macOS `.saver` settings sheet** | Layers and motion can be changed from System Settings → Options | The `.saver` has its own web storage, so today it always runs with default settings. |
| 1.8 | **Multi-monitor** (hardware) | Saver covers every display on macOS and Windows, exits on input from any | Code exists (one window per monitor); never tested with two displays. |

## 2. Data

| # | Task | Done when | Notes |
|---|---|---|---|
| 2.1 | **Tell CoCoRaHS about the app** (account) | A reply from info@cocorahs.org is recorded in DATA_SOURCES.md | Their license (CC BY 4.0) allows our use; this is about server load. If they prefer, add a once-a-day mirror (allowed by CC BY). |
| 2.2 | Groundwater **compared to normal** | Wells shaded by percentile for the date, with the method shown | Needs USGS daily statistics; research which collection serves them. Until then wells show raw depth only. |
| 2.3 | SWOT lake heights | A labelled satellite layer with quality filtering and datum handling | See DATA_SOURCES.md § SWOT. Advice wanted from hydrologists (RESEARCH_PARTNER_BRIEF.md). |
| 2.4 | National Water Model guidance | A layer labelled "model guidance, not observation" | NetCDF parsing and reach geometry. Must never look like an observation or a forecast. |
| 2.5 | Federal hydrography | Natural Earth rivers replaced by NHDPlus / 3DHP | Bigger files; needs a tiling or level-of-detail plan. |
| 2.6 | ETOPO 2022 | Basemap rebuilt from ETOPO 2022 | ETOPO1 is superseded. |
| 2.7 | Verify the USGS site-page URL | `verify` note removed from `src/data/usgs.ts` | waterdata.usgs.gov blocks automated checks; a person can confirm it in a browser. |

## 3. Distribution

| # | Task | Notes |
|---|---|---|
| 3.1 | Publish the first release | Download the draft's files, run TESTING.md, press Publish. |
| 3.2 | Flathub | Needs an app ID on a domain or code host the project controls (RELEASING.md). |
| 3.3 | Homebrew cask, winget, AUR | Standard manifests pointing at release files. Good first contributions. |

## Good first issues

- Run `actionlint` on `.github/workflows/` and fix what it finds.
- Add a depth-to-water gradient to the About legend (`src/ui/Overlay.ts`, `src/styles.css`).
- Write a Homebrew cask for the `.dmg` once a release is published.
- Translate nothing yet: the UI is English-only, and adding i18n needs a short design issue first.

## Deliberately not planned

- **A volunteer-computing workload of our own.** No candidate needs many machines; see
  VOLUNTEER_COMPUTING.md. BOINC (and Science United) is how this app contributes compute.
- **Forecasts or warnings.** The app shows observations and labels everything else; the National
  Weather Service issues warnings.
- **Telemetry or accounts.**
