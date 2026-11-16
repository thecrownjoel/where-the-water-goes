# Platforms and screensaver status

**Summary:**
- v0.1 is a desktop app with an **idle fullscreen mode**. It is not yet a verified native screensaver on any OS. A native macOS `.saver` builds and renders in a test harness, but has not yet been run inside System Settings.
- The macOS build was compiled and run on an M1 (macOS Darwin 24.6).
- Windows and Linux builds are set up in CI (`.github/workflows/ci.yml`) but have not been run or tested by hand.

## Launch modes

| Command | Behaviour |
|---|---|
| *(no args)* | Explorer window: guided tour, or explore mode with drag/zoom and click-a-gauge |
| `--saver`, `/s` | One borderless, always-on-top window per monitor. Exits on deliberate input (more than 12 px of mouse travel, a key, a click or the scroll wheel) |
| `--idle [minutes]` | Tray icon. Opens the saver after N minutes without input (default 10, range 1–240). Tray menu: Start now, Pause, Open explorer, Quit |
| `/c` | Opens the explorer with Settings open |
| `/p <hwnd>` | Draws a static thumbnail (`src-tauri/assets/preview.bmp`) into the settings dialog's preview box with GDI, then exits when Windows closes it. No data is shown. **Type-checked for Windows; not yet run on Windows** |

## macOS

- **Verified:**
  - The `.app` builds (`npm run tauri build -- --bundles app`) and launches.
  - WebGL runs in WKWebView ("Apple GPU", about 30 fps at the 30 fps cap).
  - USGS requests pass the CSP, and the IndexedDB cache persists between launches.
  - `--saver` opened a fullscreen window and rendered at about 23 fps on a Retina display at 2× pixel density, before the cap was lowered to 1.5×.
- **Not verified:**
  - Exit-on-input in the built app, and the idle trigger. Synthetic input wasn't available in this environment.
  - Multi-monitor behaviour. Only one display was present.
- **DMG:** `bundle_dmg.sh` needs Finder automation permission. It failed here with an AppleEvent timeout; CI should build it.
- **Native `.saver` (spike, 2026-11-03).** `macos-saver/` holds a Swift `ScreenSaverView` that hosts a WKWebView running the same web build. Build it with `./scripts/build-macos-saver.sh` (Command Line Tools only, no Xcode) → `build/macos-saver/Where the Water Goes.saver`, a universal (arm64 + x86_64), ad-hoc-signed bundle of about 9 MB.
  - **How it works:** the web files are bundled inside the `.saver` and served through a custom `wtrshd://app/` scheme that serves only files under `Contents/Resources/web` and sends the same CSP as the Tauri build (network limited to `api.waterdata.usgs.gov`). The page gets `?mode=saver&host=macos-saver`, so it never exits itself: the system host dismisses the saver on input. The web view ignores mouse and keyboard.
  - **Preview pane:** with `preview=1` the page drops all text and renders at low quality.
  - **Verified** with `macos-saver/harness` (loads the bundle through `NSBundle.principalClass`, as the screensaver host does, and snapshots the web view): on macOS 15.6.1 / M1 it loaded live USGS data for all three layers, WebGL 2 was available, the status line showed mode, observation and retrieval times, and the IndexedDB cache persisted between runs. The preview size rendered the globe without text.
  - **Not verified:** running inside System Settings and `legacyScreenSaver` (it has not been installed into `~/Library/Screen Savers`), multiple monitors, macOS 26, and the stop workaround below.
  - **Known host problems:** on macOS 14 and later, `legacyScreenSaver` is widely reported to keep savers running after dismissal, to create duplicate instances, and to mishandle second monitors (FB19204084, FB19201567, FB19206021). The view exits its process on the `com.apple.screensaver.willstop` distributed notification. This is a community workaround, not documented by Apple. **Verify before release.**
  - **Settings:** the `.saver` has no configuration sheet and its web storage is separate from the app's, so it always runs with default settings (reduced motion still follows the system setting).
  - **Distribution** needs Developer ID signing and notarization (not done). An ad-hoc-signed `.saver` installs only on the machine that built it, after Gatekeeper approval.
  - **To try it:** double-click the built `.saver` (System Settings offers to install it for the current user), or copy it into `~/Library/Screen Savers/`. Remove it from that folder to uninstall.

  Apple has said no modern screensaver API will come in macOS 26.
- **Gatekeeper:** unsigned builds need right-click → Open the first time.

## Windows

- A `.scr` is a renamed `.exe`. The NSIS installer (per-machine) copies the app to `System32\WhereTheWaterGoes.scr` (`src-tauri/windows/hooks.nsh`), so it appears in Screen Saver Settings, and removes it on uninstall. It never selects itself as the active saver. To build one by hand: `npm run tauri build`, then `node scripts/make-scr.mjs`, then right-click the `.scr` → Install.
- If the app is already running (for example the `--idle` tray), a second launch with `/s` or `/c` is forwarded to it and opens the saver or the settings. Before this fix it opened the explorer.
- **Untested.** The installer bundles the WebView2 bootstrapper (`webviewInstallMode: downloadBootstrapper`) for the few Windows 10 machines without the runtime.
- **SmartScreen:** expect warnings until the build is signed with Authenticode.
- **Preview (`/p`):** a static GDI thumbnail rather than a live WebView2: embedding WebView2 in a foreign child HWND is heavy for a 152×112 box and fragile. See `src-tauri/src/preview.rs`.

## Linux

- **Packages:** `.deb`, `.rpm`, `.AppImage` and a Flatpak (`packaging/flatpak/`), with AppStream metadata for software centers. See [RELEASING.md](RELEASING.md).

- **Idle detection:** X11 through the `user-idle` crate. On Wayland it works only where the compositor exposes idle information (KDE and wlroots-based compositors). GNOME/Wayland does not support third-party screensavers.
- **WebKitGTK WebGL:** it can silently fall back to software rendering, and NVIDIA on Wayland can crash ("Error 71"). Workarounds are `WEBKIT_DISABLE_DMABUF_RENDERER=1` or `__NV_DISABLE_EXPLICIT_SYNC=1`. The app detects llvmpipe/SwiftShader and picks low quality automatically.
- **XScreenSaver hack mode** (drawing into `XSCREENSAVER_WINDOW`): not implemented. Tauri can't embed its webview in another program's window.

## Power and thermal

- 30 fps by default.
- The render loop stops when the page is hidden.
- On battery, "auto" quality switches to low (no bloom, 1× pixel density) and 30 fps. This needs native support for battery state.
- Pixel density is capped at 1.5× in high quality.
- Platform thermal APIs aren't used yet. Lowering the frame rate is our main lever.
