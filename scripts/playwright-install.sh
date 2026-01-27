#!/bin/bash

# Skip in Dependabot environments (not needed and causes failures)
# DEPENDABOT is set in the updater environment, GITHUB_ACTOR in PR workflows
if [ -n "$DEPENDABOT" ] || [ "$GITHUB_ACTOR" = "dependabot[bot]" ]; then
    echo "⏭️  Skipping Playwright install in Dependabot environment"
    exit 0
fi

# Also respect PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD for CI environments
if [ "$PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD" = "1" ]; then
    echo "⏭️  Skipping Playwright install (PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1)"
    exit 0
fi

# Install Chromium (with system deps in CI, headless shell only if requested)
if [ "$CI" = "true" ]; then
    if [ "$PLAYWRIGHT_ONLY_SHELL" = "1" ]; then
        yarn playwright install --with-deps --only-shell chromium
    else
        yarn playwright install --with-deps chromium
    fi
else
    yarn playwright install chromium
fi
