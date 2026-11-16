# Where the Water Goes

An open-source screensaver and desktop visualization that turns public U.S. water data into a living globe. It shows rivers, lakes and reservoirs, about 8,500 USGS stream gauges reporting right now, where USGS rain gauges are recording rain, and current lake and reservoir levels. Every value shows where it came from and when.

> **Independent project.** Not affiliated with or endorsed by USGS, NOAA, NASA or any agency.
> **Not a forecast or warning service.** For flood information, use your local National Weather Service office.

![Mississippi River Basin with live USGS gauges](docs/images/mississippi.png)

## What you see

- **Warm points:** USGS stream gauges (latest discharge). Size is proportional to the log of the published value. A hollow ring means USGS flagged the value as estimated. Most values are provisional.
- **Blue ripples:** USGS rain gauges whose latest reporting interval (usually 5–15 minutes) recorded rain. Dry gauges are not drawn. This is rain measured at points, not a radar map. When enough gauges in one area are recording rain, the tour flies there.

  ![Tour stop over gauges recording rain in Minnesota and Wisconsin, 2026-11-02](docs/images/rain.png)

- **Teal markers:** USGS lake and reservoir level gauges. All are the same size, because elevation above a datum is not depth. Click one to see its value and datum.
- **Blue lines:** a cartographic river network. The glints move in the *inferred* downstream direction. They do **not** show measured or modeled flow.
- **Terrain and sea floor:** NOAA ETOPO1. **Coastlines, lakes, rivers:** Natural Earth.
- **Volunteer computing:** if [BOINC](https://boinc.berkeley.edu) is running, Settings and the saver show what this computer is contributing to research, such as [climateprediction.net](https://main.cpdn.org/). The app computes nothing itself. See [docs/VOLUNTEER_COMPUTING.md](docs/VOLUNTEER_COMPUTING.md).
- The status line always separates **mode** (Live / Cached / *Archived snapshot · not live*), **observation time** and **retrieval time**.

## Run it

Requirements: Node ≥ 22.18. Rust (via rustup) is needed only for the desktop app.

```sh
npm install
npm run dev            # browser at http://localhost:5173
npm test               # unit tests (Vitest)
npm run tauri dev      # desktop app
npm run tauri build    # release bundle for this OS
./scripts/build-macos-saver.sh   # macOS: native .saver → build/macos-saver/ (experimental)
```

Desktop launch modes (see [docs/PLATFORMS.md](docs/PLATFORMS.md)):

```sh
"Where the Water Goes" --saver       # fullscreen on every monitor, exits on input
"Where the Water Goes" --idle 10     # tray; starts the saver after 10 idle minutes
```

**Keys:** `T` tour/explore · `I` about and data sources · `S` settings · `Esc` close.
In explore mode, drag to rotate, scroll to zoom, and click a gauge for details.

## Install

Download from [Releases](https://github.com/thecrownjoel/where-the-water-goes/releases):

- **macOS:** `.dmg` for the app. `.saver.zip` for the screensaver: unzip and double-click.
- **Windows:** `-setup.exe`. It also installs the screensaver, which you pick in Screen Saver Settings.
- **Linux:** `.deb`, `.rpm`, `.AppImage` or `.flatpak`. For idle fullscreen, add `where-the-water-goes --idle 10` to your session's autostart.

Builds are unsigned until signing certificates are set up, so expect a Gatekeeper or SmartScreen prompt. Maintainers: see [docs/RELEASING.md](docs/RELEASING.md).

## Platform status (v0.1)

| | App | Idle fullscreen | Native screensaver |
|---|---|---|---|
| macOS | ✅ built and run | ✅ saver windows run; idle trigger untested by hand | ◐ `.saver` builds (`scripts/build-macos-saver.sh`) and renders live data in a test harness; not yet run in System Settings, unsigned |
| Windows | CI build, untested | implemented, untested | `.scr` installed into System32 by the NSIS installer (untested); `/p` preview is a static thumbnail (untested) |
| Linux | CI build, untested | X11 implemented, untested; Wayland partial | ❌ |

## Rebuilding the bundled data

```sh
node scripts/fetch-basemap-sources.mjs .data-raw
node scripts/build-basemap.mjs .data-raw        # → public/data/base + manifest.json (hashes, provenance)
node scripts/build-demo-snapshot.ts             # → public/data/demo/usgs-snapshot.json (real, archived)
```

## Documentation

- [Investigation and plan](docs/PLAN.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Data sources](docs/DATA_SOURCES.md)
- [Platforms and screensaver status](docs/PLATFORMS.md)
- [Volunteer computing (BOINC)](docs/VOLUNTEER_COMPUTING.md)
- [Releasing and signing](docs/RELEASING.md)
- [Privacy](docs/PRIVACY.md)
- [Licensing](docs/LICENSING.md)
- [Research partner brief](docs/RESEARCH_PARTNER_BRIEF.md)
- [Contributing](CONTRIBUTING.md)
- [Security](SECURITY.md)

## License

Code: Apache-2.0 (see [LICENSE](LICENSE) and [NOTICE](NOTICE)). Data credits are in [NOTICE](NOTICE).
