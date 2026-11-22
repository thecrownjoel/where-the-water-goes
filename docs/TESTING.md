# Manual testing

Automated tests (`npm test`, `cargo test`) cover parsing, caching, fallbacks and launch arguments.
What they can't cover is the part that makes this a screensaver: the operating system starting it,
stopping it, and showing it on real displays. This checklist is for that. Please report results
with the **Platform test report** issue template, including what failed.

Use the files from a release (or a draft release) when you can, since that's what users get.

## Every platform

- [ ] The app opens and the status line says **Live** within a minute (needs internet).
- [ ] The status bar shows streamflow plus the rain, CoCoRaHS, lake-level and groundwater lines.
- [ ] Tinted land (aquifers) is visible over the U.S.; in Explore (`T`), clicking the land in
      Kansas names the **High Plains aquifer**.
- [ ] Clicking a gauge, a well (violet diamond) and a CoCoRaHS disc each opens a card with source and times.
- [ ] Settings: each layer toggle hides and shows its marks. "Archived snapshot" switches every
      line to *Archived snapshot · not live*.
- [ ] Turn networking off and restart: the app shows *Cached* data with a notice, never a blank globe.
- [ ] Reduced motion (Settings → Motion) stops camera flights and moving glints.

## macOS

**App (`.dmg`):**
- [ ] Install, open (right-click → Open while unsigned).
- [ ] `"/Applications/Where the Water Goes.app/Contents/MacOS/where-the-water-goes" --saver` covers
      each display and exits on a key press, a click or a deliberate mouse move.
- [ ] `--idle 1`: tray icon appears; after 1 minute without input the saver starts.

**Native screensaver (`.saver.zip`):**
- [ ] Unzip, double-click `Where the Water Goes.saver`, install for this user.
- [ ] System Settings → Screen Saver shows it, and the small preview draws a globe (no text).
- [ ] Start it (hot corner, or wait). The globe appears with the status line.
- [ ] Any input dismisses it, and **Activity Monitor shows no `legacyScreenSaver` process using CPU
      a minute later** (the known macOS 14+ bug). Note your macOS version.
- [ ] With two displays: both show the saver; dismissing from either display ends both.
- [ ] Start and dismiss five times in a row: no duplicate globes, no growing memory.
- [ ] Remove it: delete `~/Library/Screen Savers/Where the Water Goes.saver`.

## Windows

- [ ] Run `-setup.exe` (SmartScreen → More info → Run anyway while unsigned).
- [ ] Settings → Personalization → Lock screen → Screen saver lists **WhereTheWaterGoes**.
- [ ] The small preview box shows a static picture (the `/p` thumbnail).
- [ ] **Preview** button runs the saver full screen; mouse movement or a key exits it.
- [ ] **Settings…** opens the app with Settings open (`/c`).
- [ ] Set a 1-minute wait and leave the computer: the saver starts on every display.
- [ ] With the app's tray (`--idle`) already running, starting the saver doesn't open a second copy.
- [ ] Uninstall removes `C:\Windows\System32\WhereTheWaterGoes.scr`.

## Linux

- [ ] Install the `.deb` or `.rpm`, or run the AppImage, or `flatpak install` the bundle.
- [ ] `where-the-water-goes` opens; WebGL works (if the globe is grey or the app crashes on
      NVIDIA + Wayland, try `WEBKIT_DISABLE_DMABUF_RENDERER=1` and report it).
- [ ] `where-the-water-goes --idle 1` starts the saver after a minute idle on X11. On Wayland, note
      the desktop (KDE, GNOME, Sway…) and whether it worked.
- [ ] `--saver` covers every display and exits on input.

## Reporting

Include: OS and version, CPU/GPU, number of displays, which file you installed, each checkbox
result, and anything surprising. Screenshots help. Logs: run the app with `WTRSHD_DIAG=1` set and
copy what it prints.
