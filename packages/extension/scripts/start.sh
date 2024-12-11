#!/usr/bin/env bash

# set -x
set -e
set -o pipefail

# Check if CLI is built, if not, build all packages
if [ ! -f "../cli/dist/app.mjs" ]; then
  echo "Building packages first..."
  (cd ../../ && yarn build)
fi

yarn ocap start "./src/vats" &
OCAP_PID=$!

function cleanup() {
  # Kill the build if it's still running
  if kill -0 $OCAP_PID 2>/dev/null; then
    kill $OCAP_PID
  fi
}

# Ensure we always close the ocap cli
trap cleanup EXIT

yarn build:vite:dev --watch