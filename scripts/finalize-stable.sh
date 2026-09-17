#!/usr/bin/env bash
#
# Let the self-extractor's "Installation complete" panel close itself.
#
# An --env=stable build is a SELF-EXTRACTOR: the real app bundle lives
# compressed in Contents/Resources/<hash>.tar.zst and is unpacked over the
# bundle on first launch. The extractor then shows a modeless "Installation
# complete" panel and launches the app without waiting for it, so the panel is
# left stranded behind the app window with a Close button nobody asked for.
# ELECTROBUN_INSTALLER_UI_AUTOCLOSE dismisses it; LSEnvironment on the stub is
# how a Finder launch gets to see the variable.
#
# The outer stub's plist is the only one that needs it: it is the one in play on
# the single launch that extracts, and extraction then replaces it with the
# payload's copy — so the variable is gone by the time the app runs normally.
#
# Patching a sealed resource means the outer bundle has to be re-signed, or the
# signature no longer matches and macOS refuses to launch it. That is also why
# this runs before the copy to /Applications, not after.
#
# Idempotent: safe to re-run.
set -euo pipefail

APP="build/stable-macos-arm64/SKP Viewer.app"
ENT="build/stable-macos-arm64/entitlements.plist"
IDENTITY="${ELECTROBUN_DEVELOPER_ID:-SKP Viewer Signing}"

if [[ ! -d "$APP" ]]; then
  echo "finalize-stable: $APP not found — run build:app:stable first" >&2
  exit 1
fi
if [[ ! -f "$ENT" ]]; then
  echo "finalize-stable: $ENT not found — expected Electrobun's entitlements" >&2
  exit 1
fi

/usr/bin/plutil -replace LSEnvironment -json \
  '{"ELECTROBUN_INSTALLER_UI_AUTOCLOSE": "1"}' "$APP/Contents/Info.plist"

codesign --force --sign "$IDENTITY" --entitlements "$ENT" --options runtime "$APP"

# Verify the key survived and the signature is the one we meant to apply.
# The signature is read into a variable rather than piped: `grep -q` exits on
# the first match, and the SIGPIPE that gives codesign would fail the pipeline
# under `set -o pipefail`.
/usr/libexec/PlistBuddy -c "Print :LSEnvironment:ELECTROBUN_INSTALLER_UI_AUTOCLOSE" \
  "$APP/Contents/Info.plist" >/dev/null
SIG="$(codesign -dvv "$APP" 2>&1)"
grep -qF "Authority=$IDENTITY" <<<"$SIG"

echo "finalize-stable: installer autoclose set on the self-extractor stub, re-signed"
