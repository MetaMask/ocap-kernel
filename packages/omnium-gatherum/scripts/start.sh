#!/usr/bin/env bash

set -x
set -e
set -o pipefail

yarn ocap relay &
RELAY_PID=$!

yarn ocap start "../kernel-test/src/vats/default" &
OCAP_PID=$!

function cleanup() {
  # Kill the build if it's still running
  if kill -0 $RELAY_PID 2>/dev/null; then
    kill $RELAY_PID
  fi
  if kill -0 $OCAP_PID 2>/dev/null; then
    kill $OCAP_PID
  fi
}

# Ensure we always close the ocap cli
trap cleanup EXIT

yarn build:browser
