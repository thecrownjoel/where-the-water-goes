# Releasing

## Cutting a release

1. Bump `version` in `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`, `package.json` and `macos-saver/Info.plist` (`CFBundleShortVersionString`, and increment `CFBundleVersion`), and add a
   `<release>` entry to `src-tauri/linux/org.wherethewatergoes.app.metainfo.xml`.
2. Commit, then tag and push: `git tag v0.2.0 && git push origin v0.2.0`.
3. `.github/workflows/release.yml` builds everything and attaches it to a **draft** GitHub Release.
4. Download the files from the draft, try them on each OS, then press **Publish**. Nothing is public
   before that.

To build the same files without a release, run the workflow by hand (Actions → Release → Run
workflow). The files show up as workflow artifacts.

## What gets built

| Platform | File | Screensaver |
|---|---|---|
| macOS | `.dmg` with a universal (Apple silicon + Intel) `.app` | `WhereTheWaterGoes_<v>_macOS.saver.zip`: double-click the `.saver` to install it in System Settings → Screen Saver |
| Windows | NSIS `-setup.exe`, installed per machine | The installer copies `WhereTheWaterGoes.scr` into System32, so it appears in Screen Saver Settings. Uninstalling removes it. A standalone `WhereTheWaterGoes.scr` is attached as well |
| Linux | `.deb`, `.rpm`, `.AppImage`, `.flatpak` | No native hook (see PLATFORMS.md). Run `where-the-water-goes --idle 10` at login for idle fullscreen |

We never select ourselves as the active screensaver. Users choose it in their OS settings.

## Signing (optional, per platform)

Without signing the builds still work, but users see warnings. Each platform switches on by itself
once its repository secrets exist (Settings → Secrets and variables → Actions).

### macOS: Developer ID + notarization

Needs an Apple Developer Program membership ($99/year).

| Secret | Value |
|---|---|
| `APPLE_CERTIFICATE` | base64 of the exported "Developer ID Application" `.p12` (`base64 -i cert.p12 \| pbcopy`) |
| `APPLE_CERTIFICATE_PASSWORD` | password of that `.p12` |
| `APPLE_SIGNING_IDENTITY` | e.g. `Developer ID Application: Jane Doe (ABCDE12345)` |
| `APPLE_ID` | Apple ID email used for notarization |
| `APPLE_PASSWORD` | an app-specific password for that Apple ID (appleid.apple.com) |
| `APPLE_TEAM_ID` | 10-character team ID |

The `.app` and `.dmg` are signed and notarized by Tauri. The `.saver` is signed by
`scripts/build-macos-saver.sh` (`CODESIGN_IDENTITY`) and notarized by `scripts/notarize-macos.sh`.

### Windows: Authenticode

Needs a code-signing certificate from a CA. An OV certificate removes the "unknown publisher"
label. SmartScreen reputation still builds up over time. EV certificates and Azure Trusted Signing
are hardware- or cloud-backed and need a different `signCommand`.

| Secret | Value |
|---|---|
| `WINDOWS_CERTIFICATE` | base64 of the `.pfx` |
| `WINDOWS_CERTIFICATE_PASSWORD` | its password |

The workflow passes Tauri a `signCommand` that signs the app binary and installer, then signs the
standalone `.scr`.

### Linux

Packages aren't signed. Flathub signs what it builds.

## Distribution channels (after a published release)

These need accounts or reviews in the project's name, so a maintainer does them:

- **Flathub:** fork `flathub/flathub` and submit `packaging/flatpak/org.wherethewatergoes.app.yml`,
  with the `app.deb` source replaced by the release URL and its `sha256`. Flathub requires the app ID
  to match a domain or code host you control. `org.wherethewatergoes.app` needs that domain; the
  alternative is `io.github.thecrownjoel.WhereTheWaterGoes`, which means renaming the ID everywhere.
- **Homebrew cask, winget, AUR:** standard manifests that point at the release files.

## Not yet verified

The release workflow has not run on GitHub yet, and actionlint hasn't been run on it. The NSIS
install hook, the Flatpak build and the signing paths are untested until the first tagged run.
Check the draft carefully the first time.
