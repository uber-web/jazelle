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

# `grep` is anchored to the `real <secs>` line that `time -p` emits. An unanchored
# match also picks up any line of `run`'s output that happens to contain the substring
# "real" -- which is easy to hit, since a repo path like /code/realtime-app appears in
# Bazel's output -- and awk then emits one number per matching line, leaving TIME
# multi-line and breaking the arithmetic in cli.sh that consumes it.
TIME=$((time -p run) 2>&1 | grep -E '^real[[:space:]]' | awk '{print int(1000 * $2)}')

CLI="$RUNFILES/$JAZELLE_REPO/bin/cli.sh"
if [ ! -f $CLI ]
then
  CLI="$BIN/cli.sh"
fi

BOOTSTRAP_TIME="$TIME" source "$CLI"
