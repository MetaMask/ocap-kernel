#!/usr/bin/env bash

set -x
set -e
set -o pipefail

# We borrow the vat definition from extension for now
yarn ocap bundle "src/demo/console/vats"

# Start the server in background and capture its PID
yarn ocap serve "src/demo/console/vats" & 
SERVER_PID=$!

function cleanup() {
  # Kill the server if it's still running
  if kill -0 $SERVER_PID 2>/dev/null; then
    kill $SERVER_PID
  fi
}
# Ensure we always close the server
trap cleanup EXIT

yarn demo:console
