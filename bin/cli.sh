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
GLOBAL_BIN="$BIN"
BIN="$ROOT/bazel-bin/jazelle.runfiles/jazelle/bin"
START=$(bash -p "$GLOBAL_BIN/now")

if [ ! -d "$BIN" ]
then
  BIN=$(dirname $(realpath "$0"))
fi

if [ "$1" = "init" ]
then
  source "$BIN/init.sh"
else
  NODE="$ROOT/bazel-bin/jazelle.runfiles/jazelle_dependencies/bin/node"
  YARN="$ROOT/bazel-bin/jazelle.runfiles/jazelle_dependencies/bin/yarn.js"
  JAZELLE="$ROOT/bazel-bin/jazelle.runfiles/jazelle/cli.js"

  # if we can't find Bazel workspace, fall back to system node and jazelle's pinned yarn
  if [ ! -f "$NODE" ] || [ ! -f "$YARN" ] || [ ! -f "$JAZELLE" ]
  then
    # if we're in a repo, jazelle declaration in WORKSPACE is wrong, so we should error out
    if [ -f "$ROOT/WORKSPACE" ]
    then
      cat /tmp/jazelle.log 2>/dev/null # logged by bootstrap.sh
      echo "Attempting to use system Node/Yarn/Jazelle versions..."
    fi
    NODE="$(which node)"
    YARN="$BIN/yarn.js"
    JAZELLE="$BIN/../cli.js"
  fi

  # prep for postcommand (needs to be done before payload because `jazelle prune` deletes node
  PRECOMMAND=$("$NODE" -p "(require('$ROOT/manifest.json').hooks || {}).precommand || ':'" 2>/dev/null || ":")
  POSTCOMMAND=$("$NODE" -p "(require('$ROOT/manifest.json').hooks || {}).postcommand || ':'" 2>/dev/null || ":")
  VERSION=$("$NODE" -p "require('$BIN/../package.json').version")
  BOOTSTRAP_TIME=${BOOTSTRAP_TIME-0} # default to zero

  # precommand hook
  NOW=$(bash -p "$GLOBAL_BIN/now")
  DURATION=$((NOW - START + BOOTSTRAP_TIME))
  (cd "$ROOT" && VERSION="$VERSION" DURATION="$DURATION" COMMAND="$1" COMMAND_ARGS="${@:2}" EXIT_CODE=$EXIT_CODE eval "$PRECOMMAND")

  # payload
  export NODE_NO_WARNINGS=1 # hide [MODULE_NOT_FOUND] errors
  "$NODE" --max_old_space_size=65536 "$JAZELLE" "$@"
  EXIT_CODE=$?

  # postcommand hook
  END=$(bash -p "$GLOBAL_BIN/now") # we don't use `time` because otherwise it would mess w/ stdio piping of the main command
  DURATION=$((END - START + BOOTSTRAP_TIME))
  (cd "$ROOT" && VERSION="$VERSION" DURATION="$DURATION" COMMAND="$1" COMMAND_ARGS="${@:2}" EXIT_CODE=$EXIT_CODE eval "$POSTCOMMAND")

  exit $EXIT_CODE
fi
