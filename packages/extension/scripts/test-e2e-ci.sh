#!/usr/bin/env bash
set -x
set -e
set -o pipefail

yarn build

# Bundle and serve test vats (e.g., empty-vat used by minimal-cluster.json)
yarn run -T ocap bundle "../kernel-test/src/vats/default"
yarn run -T ocap serve "../kernel-test/src/vats/default" &
SERVER_PID=$!

function cleanup() {
  if kill -0 $SERVER_PID 2>/dev/null; then
    kill $SERVER_PID
  fi
}
trap cleanup EXIT

yarn test:e2e "$@"
