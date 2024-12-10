#!/usr/bin/env bash

set -x
set -e
set -o pipefail

yarn build:vite:dev --watch &
BUILD_PID=$!

function cleanup() {
  # Kill the build if it's still running
  if kill -0 $BUILD_PID 2>/dev/null; then
    kill $BUILD_PID
  fi
}

# Ensure we always close the builder
trap cleanup EXIT

yarn ocap start "./src/vats"
