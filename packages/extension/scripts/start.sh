#!/usr/bin/env bash

set -x
set -e
set -o pipefail

yarn build:vite:dev --watch &
BUILD_PID=$!

yarn ocap start "./src/vats"
OCAP_PID=$!

function cleanup() {
  # Kill the build if it's still running
  if kill -0 $BUILD_PID 2>/dev/null; then
    kill $BUILD_PID
  fi
  # Kill the server if it's still running
  if kill -0 $OCAP_PID 2>/dev/null; then
    kill $OCAP_PID
  fi
}

# Ensure we always close the server
trap cleanup EXIT
