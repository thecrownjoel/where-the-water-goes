# Platforms and screensaver status

**Summary:**
- v0.1 is a desktop app with an **idle fullscreen mode**. It is not yet a verified native screensaver on any OS.
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
- **No native `.saver`.** It would need:
  1. A separate Swift `ScreenSaverView` plug-in embedding WKWebView with the built `dist/`.
  2. Developer ID signing and notarization.
  3. Workarounds for the `legacyScreenSaver` bugs open on macOS 26: savers that never stop, duplicate instances, problems with second monitors (FB19204084, FB19201567, FB19206021).

  Apple has said no modern screensaver API will come in macOS 26.
- **Gatekeeper:** unsigned builds need right-click → Open the first time.

## Windows

- A `.scr` is a renamed `.exe`. After `npm run tauri build`, run `node scripts/make-scr.mjs`, then right-click the `.scr` → Install.
- **Untested.** The installer bundles the WebView2 bootstrapper (`webviewInstallMode: downloadBootstrapper`) for the few Windows 10 machines without the runtime.
- **SmartScreen:** expect warnings until the build is signed with Authenticode.
- **Preview (`/p`):** a static GDI thumbnail rather than a live WebView2: embedding WebView2 in a foreign child HWND is heavy for a 152×112 box and fragile. See `src-tauri/src/preview.rs`.

## Linux

- **Idle detection:** X11 through the `user-idle` crate. On Wayland it works only where the compositor exposes idle information (KDE and wlroots-based compositors). GNOME/Wayland does not support third-party screensavers.
- **WebKitGTK WebGL:** it can silently fall back to software rendering, and NVIDIA on Wayland can crash ("Error 71"). Workarounds are `WEBKIT_DISABLE_DMABUF_RENDERER=1` or `__NV_DISABLE_EXPLICIT_SYNC=1`. The app detects llvmpipe/SwiftShader and picks low quality automatically.
- **XScreenSaver hack mode** (drawing into `XSCREENSAVER_WINDOW`): not implemented. Tauri can't embed its webview in another program's window.

## Power and thermal

- 30 fps by default.
- The render loop stops when the page is hidden.
- On battery, "auto" quality switches to low (no bloom, 1× pixel density) and 30 fps. This needs native support for battery state.
- Pixel density is capped at 1.5× in high quality.
- Platform thermal APIs aren't used yet. Lowering the frame rate is our main lever.
