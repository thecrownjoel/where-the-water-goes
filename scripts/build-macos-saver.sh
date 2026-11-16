#!/usr/bin/env bash
# Build the native macOS screensaver bundle: build/macos-saver/Where the Water Goes.saver
# Needs only the Xcode Command Line Tools (swiftc), not Xcode.
# Signing: ad-hoc by default, which runs only on the machine that built it. Set
# CODESIGN_IDENTITY="Developer ID Application: Name (TEAMID)" to sign for distribution, then
# notarize with scripts/notarize-macos.sh (the release workflow does both when secrets exist).
set -euo pipefail
cd "$(dirname "$0")/.."

OUT="build/macos-saver/Where the Water Goes.saver"
EXE=WhereTheWaterGoes
MIN=12.0

if [[ "${SKIP_WEB_BUILD:-0}" != 1 ]]; then npm run build; fi

rm -rf "$OUT"
mkdir -p "$OUT/Contents/MacOS" "$OUT/Contents/Resources/web" build/macos-saver/obj

for arch in arm64 x86_64; do
  swiftc -O -module-name WhereTheWaterGoesSaver -emit-library \
    -target "$arch-apple-macos$MIN" \
    -framework ScreenSaver -framework WebKit \
    -o "build/macos-saver/obj/$EXE-$arch" \
    macos-saver/Sources/*.swift
done
lipo -create -output "$OUT/Contents/MacOS/$EXE" build/macos-saver/obj/$EXE-arm64 build/macos-saver/obj/$EXE-x86_64

cp macos-saver/Info.plist "$OUT/Contents/Info.plist"
# The web build, without source maps.
rsync -a --exclude '*.map' dist/ "$OUT/Contents/Resources/web/"

if [[ -n "${CODESIGN_IDENTITY:-}" ]]; then
  codesign --force --options runtime --timestamp --sign "$CODESIGN_IDENTITY" "$OUT"
else
  codesign --force --sign - "$OUT"
fi
echo "built: $OUT"
