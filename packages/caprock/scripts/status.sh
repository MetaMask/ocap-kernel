#!/usr/bin/env bash
PLUGIN_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
node "${PLUGIN_ROOT}/dist/bin/status.mjs" "$@"
