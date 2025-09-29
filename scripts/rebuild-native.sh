#!/bin/bash

# Script to rebuild native dependencies after yarn install
# This checks if artifacts already exist to avoid unnecessary rebuilds

# Track if any builds fail
BUILD_FAILED=0

# Check and rebuild better-sqlite3
if [ -d node_modules/better-sqlite3 ] && [ ! -f node_modules/better-sqlite3/build/Release/better_sqlite3.node ]; then
    echo "🔨 Building better-sqlite3..."
    if ! (cd node_modules/better-sqlite3 && yarn build-release); then
        echo "❌ Failed to build better-sqlite3" >&2
        BUILD_FAILED=1
    fi
fi

# Check and rebuild @ipshipyard/node-datachannel
if [ -d node_modules/@ipshipyard/node-datachannel ] && [ ! -f node_modules/@ipshipyard/node-datachannel/build/Release/node_datachannel.node ]; then
    echo "🔨 Building @ipshipyard/node-datachannel..."
    if ! npm rebuild @ipshipyard/node-datachannel; then
        echo "❌ Failed to build @ipshipyard/node-datachannel" >&2
        BUILD_FAILED=1
    fi
fi

# Exit with error if any builds failed
if [ $BUILD_FAILED -eq 1 ]; then
    echo "⚠️  Some native modules failed to build. This may cause runtime errors." >&2
    exit 1
fi
