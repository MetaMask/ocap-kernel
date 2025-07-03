#!/usr/bin/env bash

set -o pipefail

# Enable nullglob to handle cases where pattern doesn't match
shopt -s nullglob

# Resolve the glob pattern to actual path
DEMO_PATHS=("demos/$1-"*)

# Check if we found any matching paths
if [ ${#DEMO_PATHS[@]} -eq 0 ]; then
    echo "No demo found matching pattern: demos/$1-*"
    exit 1
fi

# Use the first matching path
DEMO_PATH="${DEMO_PATHS[0]}"

yarn ocap start "$DEMO_PATH" &> /dev/null &
OCAP_PID=$!

function cleanup() {
  # Kill the build if it's still running
  if kill -0 $OCAP_PID 2>/dev/null; then
    kill $OCAP_PID
  fi
}

# Ensure we always close the ocap cli
trap cleanup EXIT

# Wait for the server to be ready
for _ in {1..10}; do
  if curl -s http://localhost:3000 > /dev/null; then
    # Give some time for vat bundling to complete
    sleep 1
    break
  fi
  sleep 1
done

# Run different commands based on the demo number
case "$1" in
  "01")
    yarn run-bundle -b "$DEMO_PATH/my-vat.bundle" -m "$2" -p "$3"
    ;;
  "02"|"03"|"04")
    yarn run-cluster -c "$DEMO_PATH/cluster.json" -s
    ;;
  "05")
    yarn run-script -c "$DEMO_PATH/cluster.json"
    ;;
  *)
    echo "Unknown demo number: $1"
    exit 1
    ;;
esac
