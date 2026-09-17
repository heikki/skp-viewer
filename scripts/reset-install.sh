#!/usr/bin/env bash
#
# Return the Mac to the state it was in before SKP Viewer was ever installed, so
# the next `bun run install:app` exercises a genuine first launch.
#
# Usage:
#   bun run reset:install               # remove everything, including settings
#   bun run reset:install --keep-state  # leave app.db (window frame, last file,
#                                       # camera) alone
#
# Two of the things this removes are not findable from the source: the WebKit
# data store, which WKWebView creates on its own, and the TCC grants, which are
# not files at all. A third is easy to miss because its directory is named after
# the bundle id rather than the app: Electrobun's self-extraction staging area,
# holding the payload the --env=stable self-extractor unpacks on first launch —
# ~80 MB of it, sitting beside app.db under the same directory.
#
# The TCC grants matter because a signed build is the whole point of resetting.
# macOS keys a file-access grant on bundle id plus signing identity, not on the
# file, so rebuilding and reinstalling with the same identity INHERITS the grant
# — which is exactly why a reinstall alone never tests what a first install
# does. `tccutil reset All` drops them, and the app asks again on the next
# launch that reads a file in a protected folder.
#
# What this cannot restore is the "Open SKP" powerbox grants — the per-file
# access macOS hands over when you pick a file yourself. Those are not TCC
# entries and they are what makes the picker work without any permission at all.
#
set -euo pipefail

APP_ID="com.skpviewer.app"
APP="/Applications/SKP Viewer.app"
STATE="$HOME/Library/Application Support/$APP_ID/stable/app.db"

KEEP_STATE=0
for a in "$@"; do
  case "$a" in
    --keep-state) KEEP_STATE=1 ;;
    *)
      echo "unknown option: $a" >&2
      exit 2
      ;;
  esac
done

if pgrep -qf "$APP"; then
  echo "reset-install: SKP Viewer is running — quit it first" >&2
  exit 1
fi

KEPT=""
if ((KEEP_STATE)) && [[ -f "$STATE" ]]; then
  KEPT="$(mktemp -d)/app.db"
  cp "$STATE" "$KEPT"
fi

# Before the bundle goes: tccutil resolves a bundle id through LaunchServices,
# which stops resolving it once the bundle is gone (-10814). LaunchServices can
# hold a stale record for a while, so removing the app first fails only
# sometimes — the worst kind of ordering bug, and the reason for this one.
tccutil reset All "$APP_ID"

# Every path the app leaves behind. All of it is derived: rebuilt on the next
# install and launch from the app bundle.
PATHS=(
  "$APP"
  "$HOME/Library/Application Support/$APP_ID" # app.db + Electrobun self-extraction
  "$HOME/Library/WebKit/$APP_ID"              # WKWebView data store
)

for p in "${PATHS[@]}"; do
  if [[ -e "$p" ]]; then
    printf 'removing %s (%s)\n' "${p/#"$HOME"/~}" "$(du -sh "$p" | cut -f1 | tr -d ' ')"
    rm -rf "$p"
  fi
done

if [[ -n "$KEPT" ]]; then
  mkdir -p "$(dirname "$STATE")"
  cp "$KEPT" "$STATE"
  rm -rf "$(dirname "$KEPT")"
  echo "kept app.db (window frame, last file, camera)"
fi
