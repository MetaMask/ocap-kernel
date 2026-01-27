#!/bin/bash

# Skip in Dependabot updater environment (not needed and causes failures)
if [ -n "$DEPENDABOT" ]; then
    echo "⏭️  Skipping Playwright install in Dependabot environment"
    exit 0
fi

# Also respect PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD for CI environments
if [ "$PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD" = "1" ]; then
    echo "⏭️  Skipping Playwright install (PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1)"
    exit 0
fi

yarn playwright install chromium
