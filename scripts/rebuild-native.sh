#!/bin/bash

# Script to rebuild native dependencies after yarn install
# This checks if artifacts already exist to avoid unnecessary rebuilds

# Check and rebuild better-sqlite3
if [ ! -f node_modules/better-sqlite3/build/Release/better_sqlite3.node ]; then
    echo "🔨 Building better-sqlite3..."
    (cd node_modules/better-sqlite3 && yarn build-release) || true
fi

# Check and rebuild @ipshipyard/node-datachannel
if [ ! -f node_modules/@ipshipyard/node-datachannel/build/Release/node_datachannel.node ]; then
    echo "🔨 Building @ipshipyard/node-datachannel..."
    npm rebuild @ipshipyard/node-datachannel || true
fi
