#!/usr/bin/env bash
# Notarize and staple a Developer ID-signed macOS bundle (.saver, .app or .dmg).
# Usage: scripts/notarize-macos.sh <path>
# Needs APPLE_ID, APPLE_PASSWORD (an app-specific password) and APPLE_TEAM_ID.
set -euo pipefail
target="$1"
: "${APPLE_ID:?}" "${APPLE_PASSWORD:?}" "${APPLE_TEAM_ID:?}"
work="$(mktemp -d)"
zip="$work/$(basename "$target").zip"
# notarytool takes a zip (or dmg/pkg); ditto keeps the bundle's symlinks and metadata.
if [[ "$target" == *.dmg ]]; then zip="$target"; else ditto -c -k --keepParent "$target" "$zip"; fi
xcrun notarytool submit "$zip" --apple-id "$APPLE_ID" --password "$APPLE_PASSWORD" --team-id "$APPLE_TEAM_ID" --wait
xcrun stapler staple "$target"
echo "notarized: $target"
