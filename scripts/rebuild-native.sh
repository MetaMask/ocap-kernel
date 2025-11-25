#!/bin/bash

# Script to rebuild native dependencies after yarn install
# This checks if artifacts already exist to avoid unnecessary rebuilds.
# Pass --force or -f to rebuild even if build artifacts already exist.

# Track if any builds fail
BUILD_FAILED=0

# Parse flags
FORCE_REBUILD=0
for arg in "$@"; do
  case "$arg" in
    -f|--force)
      FORCE_REBUILD=1
      ;;
  esac
done
if [ "$FORCE_REBUILD" -eq 1 ]; then
    echo "🔁 Force rebuild enabled"
fi

# Detect Node.js version and set C++ standard for Node.js v24+
# Node.js v24+ requires C++20 due to V8 API changes
NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -ge 24 ]; then
    # Set C++20 flags for node-gyp builds
    export CXXFLAGS="${CXXFLAGS} -std=c++20"
    export CPPFLAGS="${CPPFLAGS} -std=c++20"
    # npm/node-gyp also respects npm_config_* environment variables
    export npm_config_cxxflags="${npm_config_cxxflags} -std=c++20"
    echo "🔧 Node.js v${NODE_VERSION} detected: Using C++20 for native builds"
fi

# Check and rebuild better-sqlite3
if [ -d node_modules/better-sqlite3 ] && \
   { [ "$FORCE_REBUILD" -eq 1 ] || \
   [ ! -f node_modules/better-sqlite3/build/Release/better_sqlite3.node ]; \
   }; then
    echo "🔨 Building better-sqlite3..."
    if ! (cd node_modules/better-sqlite3 && yarn build-release); then
        echo "❌ Failed to build better-sqlite3" >&2
        BUILD_FAILED=1
    fi
fi

# Check and rebuild @ipshipyard/node-datachannel
if [ -d node_modules/@ipshipyard/node-datachannel ] && \
   { [ "$FORCE_REBUILD" -eq 1 ] || \
   [ ! -f node_modules/@ipshipyard/node-datachannel/build/Release/node_datachannel.node ]; \
   }; then
    echo "🔨 Building @ipshipyard/node-datachannel..."
    if ! npm rebuild @ipshipyard/node-datachannel; then
        echo "❌ Failed to build @ipshipyard/node-datachannel" >&2
        BUILD_FAILED=1
    fi
fi

# Check and rebuild tree-sitter
if [ -d node_modules/tree-sitter ] && \
   { [ "$FORCE_REBUILD" -eq 1 ] || \
   [ ! -f node_modules/tree-sitter/build/Release/tree_sitter.node ]; \
   }; then
    echo "🔨 Building tree-sitter..."
    if ! npm rebuild tree-sitter; then
        echo "❌ Failed to build tree-sitter" >&2
        BUILD_FAILED=1
    fi
fi

# Exit with error if any builds failed
if [ $BUILD_FAILED -eq 1 ]; then
    echo "⚠️  Some native modules failed to build. This may cause runtime errors." >&2
    exit 1
fi
