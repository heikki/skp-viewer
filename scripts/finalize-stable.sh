#!/usr/bin/env bash
#
# Let the self-extractor's "Installation complete" panel close itself.
#
# An --env=stable build is a SELF-EXTRACTOR: the real app bundle lives
# compressed in Contents/Resources/<hash>.tar.zst and is unpacked over the
# bundle on first launch. The extractor then shows a modeless "Installation
# complete" panel and launches the app without waiting for it, so the panel is
# left stranded behind the app window with a Close button nobody asked for.
# ELECTROBUN_INSTALLER_UI_AUTOCLOSE dismisses it as soon as extraction
# finishes; LSEnvironment on the stub is how a Finder launch gets to see the
# variable.
#
# The outer stub's plist is the only one that needs it: it is the one in play on
# the single launch that extracts, and extraction then replaces it with the
# payload's copy — so the variable is gone by the time the app runs normally.
#
# Idempotent: safe to re-run.
set -euo pipefail

APP="build/stable-macos-arm64/SKP Viewer.app"

if [[ ! -d "$APP" ]]; then
  echo "finalize-stable: $APP not found — run electrobun build --env=stable first" >&2
  exit 1
fi

/usr/bin/plutil -replace LSEnvironment -json \
  '{"ELECTROBUN_INSTALLER_UI_AUTOCLOSE": "1"}' "$APP/Contents/Info.plist"

/usr/libexec/PlistBuddy -c "Print :LSEnvironment:ELECTROBUN_INSTALLER_UI_AUTOCLOSE" \
  "$APP/Contents/Info.plist" >/dev/null

echo "finalize-stable: installer autoclose set on the self-extractor stub"
