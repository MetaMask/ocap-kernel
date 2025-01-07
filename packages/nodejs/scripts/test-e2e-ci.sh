#!/usr/bin/env bash

set -x
set -e
set -o pipefail

# force build sqlite3 so it aligns with node version
yarn build:sqlite3 -f

# We borrow the vat definition from extension for now
yarn ocap bundle "../extension/src/vats"

# Start the server in background and capture its PID
yarn ocap serve "../extension/src/vats" & 
SERVER_PID=$!

function cleanup() {
  # Kill the server if it's still running
  if kill -0 $SERVER_PID 2>/dev/null; then
    kill $SERVER_PID
  fi
}
# Ensure we always close the server
trap cleanup EXIT

yarn test:e2e
