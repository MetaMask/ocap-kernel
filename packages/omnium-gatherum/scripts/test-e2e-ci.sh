#!/usr/bin/env bash

set -x
set -e
set -o pipefail

yarn ocap bundle "../kernel-test/src/vats/default"

# Start the server in background and capture its PID
yarn ocap serve "../kernel-test/src/vats/default" & 
SERVER_PID=$!

function cleanup() {
  # Kill the server if it's still running
  if kill -0 $SERVER_PID 2>/dev/null; then
    kill $SERVER_PID
  fi
}
# Ensure we always close the server
trap cleanup EXIT

yarn test:e2e "$@"
