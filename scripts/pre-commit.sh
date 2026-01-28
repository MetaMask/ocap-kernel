#!/bin/bash

set -e

# Skip pre-commit hooks in Dependabot environments
# DEPENDABOT is set in the updater environment, GITHUB_ACTOR in PR workflows
if [ -n "$DEPENDABOT" ] || [ "$GITHUB_ACTOR" = "dependabot[bot]" ]; then
    echo "⏭️  Skipping pre-commit hook in Dependabot environment"
    exit 0
fi

yarn lint-staged
yarn dedupe --check

