#!/bin/bash

# Get the directory of the script
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Set the relative directory
SOURCE_PATH="$SCRIPT_DIR/vats/ollama-static.js"

yarn ocap bundle "$SOURCE_PATH" 2>&1 | sed "s|/Users/$USER|~|g" | tee "$SCRIPT_DIR/bundle-static.log"
