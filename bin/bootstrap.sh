#!/bin/bash

realpath() {
  DIR="$PWD"
  cd "$(dirname "$1")"
  LINK=$(readlink "$(basename "$1")")
  while [ "$LINK" ]
  do
    cd "$(dirname "$LINK")"
    LINK=$(readlink "$(basename "$1")")
  done
  echo "$PWD/$(basename "$1")"
  cd "$DIR"
}

findroot() {
  if [ -f "manifest.json" ]
  then
    echo "$PWD"
  elif [ "$PWD" = "/" ]
  then
    echo ""
  else
    # a subshell so that we don't affect the caller's $PWD
    (cd .. && findroot)
  fi
}

ROOT=$(findroot)
BIN=$(dirname $(realpath "$0"))
source "$BIN/repo-mapping.sh"
RUNFILES="$ROOT/bazel-bin/jazelle.runfiles"
REPO_MAPPING="$RUNFILES/_repo_mapping"
JAZELLE_REPO=$(resolve_canonical_repo "$REPO_MAPPING" "jazelle")

run() {
  # determine required bazel version
  if [ ! -f "$ROOT/.bazelversion" ]
  then
    USE_BAZEL_VERSION=$(cat "$BIN/../templates/scaffold/.bazelversion")
  fi

  if [ ! -z "$BAZEL" ]
  then
    BAZELISK_PATH="$BAZEL"
  else
    BAZELISK_PATH="$RUNFILES/$JAZELLE_REPO/bin/bazelisk"
    if [ ! -f "$BAZELISK_PATH" ]
    then
      BAZELISK_PATH="$BIN/bazelisk"
    fi

    # if actual version is not the one listed in WORKSPACE (legacy) or
    # MODULE.bazel (bzlmod), update
    ACTUAL_VERSION=$(cat "$RUNFILES/$JAZELLE_REPO/package.json" | grep version | awk '{print substr($2, 2, length($2) - 3)}')
    if ! grep -q "$ACTUAL_VERSION" "$ROOT/WORKSPACE" "$ROOT/MODULE.bazel" 2>/dev/null || [[ $ACTUAL_VERSION = "" ]] || [ ! -f "$RUNFILES/$JAZELLE_REPO/bin/cli.sh" ]
    then
      "$BAZELISK_PATH" run //:jazelle -- setup 2>/tmp/jazelle.log || true
    fi
  fi
}

# `run`'s own output is discarded before the timing report is captured, so the stream
# awk reads contains only the three lines `time -p` emits. Filtering a stream that also
# carries `run`'s output is not reliable: `run` invokes Bazel, whose output includes the
# workspace path, so a repo directory named e.g. realtime-app puts the substring "real"
# on its own line, awk emits a number per match, and TIME ends up multi-line -- which
# then breaks the arithmetic in cli.sh that consumes it. Anchoring the match is not
# enough either, since a final line of `run` output with no trailing newline runs
# straight into the `real <secs>` line.
TIME=$( { time -p run >/dev/null 2>&1; } 2>&1 | awk '/^real/{print int(1000 * $2)}' )

CLI="$RUNFILES/$JAZELLE_REPO/bin/cli.sh"
if [ ! -f $CLI ]
then
  CLI="$BIN/cli.sh"
fi

BOOTSTRAP_TIME="$TIME" source "$CLI"
