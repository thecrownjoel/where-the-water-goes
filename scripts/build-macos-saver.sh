#!/usr/bin/env bash
# Build the native macOS screensaver bundle: build/macos-saver/Where the Water Goes.saver
# Needs only the Xcode Command Line Tools (swiftc), not Xcode.
# The bundle is ad-hoc signed, which is enough to run locally; distribution needs a
# Developer ID signature and notarization (not done here).
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

codesign --force --sign - "$OUT"
echo "built: $OUT"
