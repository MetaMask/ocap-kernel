#!/usr/bin/env bash

set -x
set -e
set -o pipefail

yarn ocap bundle "./src/vats"

# Start the server in background and capture its PID
yarn ocap serve "./src/vats" & 
SERVER_PID=$!

function cleanup() {
  # Kill the server if it's still running
  if kill -0 $SERVER_PID 2>/dev/null; then
    kill $SERVER_PID
  fi
}
# Ensures we close the server if tests fail
trap cleanup EXIT

# Run tests
yarn test:e2e

cleanup
wait $SERVER_PID
exit $?
