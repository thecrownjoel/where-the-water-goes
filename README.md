# Where the Water Goes

An open-source screensaver for **macOS and Windows** (and a desktop app on Linux) that turns public U.S. water data into a living globe: about 8,500 live USGS stream gauges, rain falling at gauges right now, lake and reservoir levels, groundwater wells, the nation's principal aquifers, and the daily reports of thousands of volunteer rain observers. Every value shows where it came from and when.

> **Independent project.** Not affiliated with or endorsed by USGS, NOAA, NASA, CoCoRaHS or any agency.
> **Not a forecast or warning service.** For flood information, use your local National Weather Service office.

![Mississippi River Basin with live USGS gauges](docs/images/mississippi.png)

**Project status:** v0.2 works and is looking for co-maintainers and testers, especially on Windows. See [Help wanted](#help-wanted).

## What you see

| Mark | What it is | Source |
|---|---|---|
| **Warm points** | Stream gauges, sized by the log of current discharge. A hollow ring = USGS flagged the value as estimated. Most values are provisional. | USGS, live |
| **Blue ripples** | Rain gauges whose latest 5–15-minute interval recorded rain. Dry gauges aren't drawn. Not a radar map. | USGS, live |
| **Soft blue discs** | Volunteers' 24-hour rain totals from this morning's reading. Size ∝ √inches; a trace is smallest. Not live: once a day. Locations rounded to ~1 km. | [CoCoRaHS](https://www.cocorahs.org), CC BY 4.0 |
| **Teal markers** | Lake and reservoir levels. All the same size: elevation above a datum is not depth. | USGS, live |
| **Violet diamonds** | Groundwater wells, shaded by depth from land surface to the water: pale = shallow, deep violet = hundreds of feet. | USGS, live |
| **Tinted land** | Principal aquifers by rock type (sand and gravel, sandstone, carbonate…). In Explore mode, click the land to name the aquifer. A 2003 national map, not a local one. | USGS, bundled |
| **Blue lines** | A cartographic river network. Glints move in the *inferred* downstream direction; they don't show measured flow. | Natural Earth |

Terrain and sea floor: NOAA ETOPO1. The status line always separates **mode** (Live / Cached / *Archived snapshot · not live*), **observation time** and **retrieval time**.

![Tour stop over gauges recording rain in Minnesota and Wisconsin, 2026-11-02](docs/images/rain.png)

**It doesn't need a constant connection.** Each layer is fetched at most every 30 minutes to 6 hours, cached on your computer, and shown from the cache in between and when you're offline.

## Take part

- **Measure rain.** [Join CoCoRaHS](https://www.cocorahs.org/Content.aspx?page=application): read a rain gauge in your yard each morning, and your report appears on this globe the same day.
- **Donate computer time.** The app runs no computations itself. If [BOINC](https://boinc.berkeley.edu) (the platform behind SETI@home) is installed, Settings and the saver show what your computer is computing for research, such as [climateprediction.net](https://main.cpdn.org/) or [Science United](https://scienceunited.org/). See [docs/VOLUNTEER_COMPUTING.md](docs/VOLUNTEER_COMPUTING.md).
- **Test it** on your OS with [docs/TESTING.md](docs/TESTING.md) and file a *Platform test report*.

## Install

Download from [Releases](https://github.com/thecrownjoel/where-the-water-goes/releases):

- **macOS screensaver:** `…_macOS.saver.zip`. Unzip, double-click `Where the Water Goes.saver`, then pick it in System Settings → Screen Saver. macOS 13 or later.
- **macOS app:** `.dmg`.
- **Windows:** `-setup.exe`. It installs the app and the screensaver; pick **WhereTheWaterGoes** in Settings → Personalization → Lock screen → Screen saver.
- **Linux:** `.deb`, `.rpm`, `.AppImage` or `.flatpak`. For idle fullscreen, add `where-the-water-goes --idle 10` to your session's autostart.

Builds are unsigned until signing certificates are set up, so expect a Gatekeeper prompt (right-click → Open) or a SmartScreen prompt (More info → Run anyway). Maintainers: see [docs/RELEASING.md](docs/RELEASING.md).

## Screensaver status (v0.2)

| | Native screensaver | App + idle fullscreen |
|---|---|---|
| **macOS** | ◐ `.saver` (Swift + WebKit) builds as a universal binary and runs in a test harness that loads it the way System Settings does, with live data for every layer (macOS 15 and 27). **Not yet run inside System Settings;** unsigned. | ✅ built and run; idle trigger untested by hand |
| **Windows** | ◐ The installer puts `WhereTheWaterGoes.scr` in System32 so it appears in Screen Saver Settings; `/s`, `/c` and `/p` are handled. Built by CI, **never run on real Windows yet.** | built by CI, untested |
| **Linux** | ❌ no native hook (GNOME/Wayland has none) | built by CI, untested; X11 idle works in code, Wayland partial |

Exit-on-input is handled twice: by the page, and by the native shell watching OS input, so a key press dismisses the saver even if its window didn't get focus. Details: [docs/PLATFORMS.md](docs/PLATFORMS.md). What's left: [docs/ROADMAP.md](docs/ROADMAP.md).

## Run from source

Requirements: Node ≥ 22.18. Rust (via rustup) is needed only for the desktop app; the Xcode Command Line Tools for the macOS `.saver`.

```sh
npm install
npm run dev            # browser at http://localhost:5173
npm test               # unit tests (Vitest)
npm run tauri dev      # desktop app
npm run tauri build    # release bundle for this OS
./scripts/build-macos-saver.sh   # macOS: native .saver → build/macos-saver/
```

Desktop launch modes (see [docs/PLATFORMS.md](docs/PLATFORMS.md)):

```sh
"Where the Water Goes" --saver       # fullscreen on every monitor, exits on input
"Where the Water Goes" --idle 10     # tray; starts the saver after 10 idle minutes
```

**Keys:** `T` tour/explore · `I` about and data sources · `S` settings · `Esc` close.
In Explore mode, drag to rotate, scroll to zoom, click a gauge, well or report for details, or click the land to name its aquifer.

### Rebuilding the bundled data

```sh
node scripts/fetch-basemap-sources.mjs .data-raw    # Natural Earth, ETOPO1, USGS aquifers (hash-checked)
node scripts/build-basemap.mjs .data-raw            # → public/data/base + manifest.json
node scripts/build-aquifers.mjs .data-raw           # → public/data/base/aquifers.json
node scripts/build-demo-snapshot.ts                 # → public/data/demo/ (real, archived)
```

## Help wanted

The project has one maintainer and would like more. The most useful help, in order:

1. **Run the Windows screensaver** on Windows 10 or 11 and report what happens ([docs/TESTING.md](docs/TESTING.md)).
2. **Run the macOS `.saver` inside System Settings** on macOS 14–27, ideally with two displays.
3. **Test the Linux packages.**
4. **Hydrology review** of how groundwater, lake datums and future model data are labelled.

[CONTRIBUTING.md](CONTRIBUTING.md) has the ground rules, [GOVERNANCE.md](GOVERNANCE.md) explains how contributors become maintainers, and [MAINTAINERS.md](MAINTAINERS.md) lists who's who.

## Documentation

- [Roadmap and open work](docs/ROADMAP.md) · [Manual testing](docs/TESTING.md)
- [Architecture](docs/ARCHITECTURE.md) · [Data sources](docs/DATA_SOURCES.md) · [Platforms](docs/PLATFORMS.md)
- [Volunteer computing (BOINC)](docs/VOLUNTEER_COMPUTING.md) · [Releasing and signing](docs/RELEASING.md)
- [Privacy](docs/PRIVACY.md) · [Licensing](docs/LICENSING.md) · [Security](SECURITY.md)
- [Original investigation and plan](docs/PLAN.md) · [Research partner brief](docs/RESEARCH_PARTNER_BRIEF.md)

## License

Code: Apache-2.0 (see [LICENSE](LICENSE) and [NOTICE](NOTICE)). Data: USGS, NOAA and Natural Earth data are public domain; CoCoRaHS data is © Colorado Climate Center, [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Credits are in [NOTICE](NOTICE).
