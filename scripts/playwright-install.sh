#!/bin/bash

# In CI, browsers are installed separately via the playwright-install composite action
if [ "$CI" = "true" ]; then
    echo "⏭️  Skipping Playwright install in CI"
    exit 0
fi

yarn playwright install --with-deps chromium
