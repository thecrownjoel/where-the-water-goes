# Investigation and plan

Written 2026-11-01, before and during the first build. Everything below was checked against official documentation or live endpoints on that date unless it is marked **verify before implementation**. Sources are linked in [DATA_SOURCES.md](DATA_SOURCES.md) and [PLATFORMS.md](PLATFORMS.md).

## 1. Is Tauri 2 a good fit?

Yes for the application, no for a native macOS screensaver. Tauri 2 (2.12.5 stable) gives us one shared WebGL frontend, a small Rust shell, and per-OS webviews: WKWebView on macOS, WebView2 on Windows, WebKitGTK on Linux.

There are three different products here, and they should not be confused:

| | macOS | Windows | Linux |
|---|---|---|---|
| **Normal desktop app** (explorer window) | ✅ built and run | ✅ expected (CI build, untested by hand) | ✅ expected (CI build). WebGL on WebKitGTK can fall back to software rendering, so we provide a low-quality mode |
| **Idle fullscreen mode** (tray app; opens fullscreen after N minutes idle) | ✅ built. Saver windows were run and rendered; idle trigger not yet tested by hand | ✅ implemented, untested | X11: implemented, untested. Wayland: partial (KDE/wlroots); GNOME offers no idle API to third-party apps |
| **True native OS screensaver** | ◐ Not produced by Tauri. A separate Swift `.saver` (ScreenSaverView + WKWebView, `macos-saver/`) builds and renders live data in a test harness. Still needed: a run inside System Settings, Developer ID signing and notarization, and checks of the macOS 14+ host bugs | ⚠️ Feasible. A `.scr` is a renamed `.exe`; we handle `/s` and `/c`. `/p` (Control Panel preview) draws a static thumbnail natively (untested on Windows) | ⚠️ X11/XScreenSaver only, and needs native embedding work. Not possible on GNOME/Wayland |

**We do not claim to be a native screensaver on any platform yet.** v0.1 ships the app plus an idle fullscreen mode, and a `.scr` path on Windows that must still be verified on real hardware.

## 2. Shared code vs. per-platform code

**Shared (TypeScript, ~95% of the code):** the visualization (Three.js plus GSAP), data ingestion and parsing, the cache, provenance and the source registry, settings, accessibility, and the UI.

**Per platform (Rust, `src-tauri/`):**
- Launch arguments (`/s /c /p`, `--saver`, `--idle`).
- One fullscreen window per monitor.
- Raising saver windows above the macOS menu bar (`NSScreenSaverWindowLevel`).
- Reading idle time: CoreGraphics on macOS, `GetLastInputInfo` on Windows, the `user-idle` crate on Linux.
- Battery state (`starship-battery`).
- The tray, and opening links safely.

**Packaging per platform:** a `.app` (plus a `.dmg` built on CI) on macOS, an NSIS installer plus a `.scr` copy on Windows, and `.deb`/AppImage on Linux. Signing (Developer ID and notarization, Authenticode) costs money and needs your identity, so it is left for you to set up.

## 3. Datasets for v1

| Dataset | v1 role | Why |
|---|---|---|
| **USGS Water Data OGC API, `latest-continuous`, 00060** | **Live layer** | One anonymous, CORS-enabled request returns every site's latest discharge (~14k records, ~780 KB gzipped). Public domain. Field names confirmed live. |
| NOAA ETOPO1 (via ERDDAP) | Bundled terrain and bathymetry | Federal, freely redistributable, small once decimated. |
| Natural Earth | Bundled rivers, lakes, coastlines | Public domain and compact. **Not federal.** To be replaced by NHDPlus V2 / NWM hydrofabric (federal) in a later milestone. |
| NASA SWOT via Hydrocron | Planned | Anonymous JSON API, but needs quality-flag filtering and datum handling before display. |
| NOAA National Water Model v3.1 | Planned, labelled "model guidance" | NetCDF parsing and reach geometry (hydrofabric) are a larger job. Must never be shown as observation or as an official forecast. |
| NOAA NWPS API | Candidate | Official flood categories and RFC forecasts as JSON. Terms not published. **Verify before implementation.** |
| OPERA DSWx-HLS, HLS, Landsat | Excluded for now | Every access route needs a per-user login (Earthdata, or requester-pays S3). A credential cannot ship in the client. |

## 4. Dataset facts

See [DATA_SOURCES.md](DATA_SOURCES.md). The same registry appears in the app's About panel (`src/data/registry.ts`).

## 5. Volunteer computing

**Recommendation: ship without it.** See [VOLUNTEER_COMPUTING.md](VOLUNTEER_COMPUTING.md). In short:
- Recomputing surface-water extent from imagery would duplicate two official products (OPERA DSWx, USGS DSWE). It would also need a per-user Earthdata login and is limited by bandwidth, not compute.
- The defensible candidates (NWM retrospective-vs-USGS skill metrics; SWOT-vs-gauge lake levels) are real and useful, but one machine finishes each in hours.
- Inventing a distributed task to justify the feature would break the project's integrity rule. The settings UI shows the feature as off and unavailable, with the reason.

## 6. Local vs. shared services

Everything works with **no project backend**:
- The client fetches from USGS directly, caches locally in IndexedDB, and falls back to the cache and then to a bundled archived snapshot.
- Nothing needs Cloudflare today.

If it's ever needed, the minimal Cloudflare role would be:
- **Pages or R2:** static hosting of signed basemap updates and release notes. Clients would verify signatures.
- **A Worker:** only if volunteer computing ever becomes justified, to receive small signed result summaries.

No user data, and no relay of agency data.

## 7. Risks

- **Scientific:**
  - Provisional data are labelled as such.
  - Stale "latest" values (5,192 of 14,263 on 2026-11-01) are dropped after 48 h.
  - Estimated values are drawn differently.
  - River flow direction is *inferred*, and the animation is cartographic, not flow. The UI says so.
- **Legal:** agency logos are not used and no endorsement is implied. Attribution follows each source's terms. The license is Apache-2.0 (see [LICENSING.md](LICENSING.md)); your confirmation is needed.
- **Privacy:** no telemetry, no accounts, no identifiers. The only network traffic is to USGS. See [PRIVACY.md](PRIVACY.md).
- **Security:**
  - Strict CSP: only USGS is reachable.
  - No remote code, no secrets in the client.
  - Responses are size-capped and validated; HTML is escaped.
  - `open_external` allows only https.
  - Unsigned binaries trigger OS warnings until signed.
- **Accessibility:** reduced motion (follows the OS setting, and can be overridden), an intensity slider, captions that can be turned off, keyboard control, ARIA live regions.
- **Battery and thermal:**
  - 30 fps cap by default; the loop pauses when the window is hidden.
  - On battery, "auto" quality drops to low.
  - Pixel ratio capped at 1.5.
  - Measured on an M1: ~30 fps windowed, ~23 fps fullscreen Retina before the cap was lowered.
- **Operational:**
  - The legacy USGS waterservices API retires in Q1 2027 (we never use it).
  - USGS rate limits are unpublished, so we refetch at most hourly (rain: every 30 minutes, about 1.7 MB per request).
  - macOS 26 screensaver host bugs are open, which is another reason a `.saver` is deferred.

## Build order

The approved plan, as executed:

1. ✅ Visual prototype with a bundled basemap and clearly labelled archived data.
2. ✅ One verified live dataset (USGS discharge) with provenance in the UI.
3. ✅ Local caching and offline behaviour (live → cached → archived).
4. ⏸ Volunteer computing: not built, deliberately (see §5).
5. ◐ Platform builds: macOS built and run; Windows/Linux configured in CI but not yet run.
6. ✅ (2026-11-02) Two more verified USGS layers from the same endpoint: rain recorded at gauges (00045) and lake/reservoir water-surface elevation (62614/62615). Each has its own staleness, refetch and fallback rules; neither falls back to archived data in live mode. The tour adds a stop over the largest cluster of gauges recording rain.
7. ✅ (2026-11-02) Saver exit-on-input logic is unit-tested; Windows `/p` preview draws a static thumbnail.
8. Next milestones:
   - federal hydrography (NWM hydrofabric) in place of Natural Earth;
   - a SWOT lake-level layer;
   - ~~a Windows `/p` preview~~ (static thumbnail done, needs a Windows test);
   - ~~a native `.saver` spike~~ (2026-11-03: builds and renders in a harness; see PLATFORMS.md);
   - Developer ID signing and notarization, then a `.saver` test inside System Settings.
