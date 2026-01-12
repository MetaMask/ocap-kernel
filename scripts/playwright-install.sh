#!/bin/bash

# Skip in Dependabot PRs (native builds aren't needed and may fail)
if [ "$GITHUB_ACTOR" = "dependabot[bot]" ]; then
    echo "⏭️  Skipping native rebuild in Dependabot PR"
    exit 0
fi

yarn playwright install chromium
