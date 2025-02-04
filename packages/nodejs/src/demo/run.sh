#!/bin/bash

# Get the directory of the script
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Set the relative directory
DEMO_PATH="$SCRIPT_DIR/run.test.ts"

# Start the server in background and capture its PID
yarn ocap start "$SCRIPT_DIR/vats" & 
SERVER_PID=$!

function cleanup() {
  echo "cleaning up"
  # Kill the server if it's still running
  if kill -0 $SERVER_PID 2>/dev/null; then
    kill $SERVER_PID
  fi
}
# Ensure we always close the server
trap cleanup EXIT

echo "running demo"
# Run the demo
yarn test --no-silent "$DEMO_PATH" 2>&1 | sed "s|/Users/$USER|~|g" | tee "$SCRIPT_DIR/test-output.log"

echo "demo finished"
