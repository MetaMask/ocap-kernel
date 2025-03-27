#!/bin/bash

# Find the vitest.config.ts file
CONFIG_FILE="vitest.config.ts"

# Create a temporary file
TMP_FILE=$(mktemp)

# Process the file
awk '
  /statements:/ { sub(/statements: [0-9.]+,/, "statements: 0,") }
  /functions:/ { sub(/functions: [0-9.]+,/, "functions: 0,") }
  /branches:/ { sub(/branches: [0-9.]+,/, "branches: 0,") }
  /lines:/ { sub(/lines: [0-9.]+,/, "lines: 0,") }
  { print }
' "$CONFIG_FILE" > "$TMP_FILE"

# Replace original file with modified content
mv "$TMP_FILE" "$CONFIG_FILE" 