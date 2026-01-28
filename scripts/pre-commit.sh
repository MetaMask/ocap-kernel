#!/bin/bash

set -e

# Skip pre-commit hooks in Dependabot environments
if "$(dirname "$0")/utils/check-dependabot.sh"; then
    echo "⏭️  Skipping pre-commit hook in Dependabot environment"
    exit 0
fi

yarn lint-staged
yarn dedupe --check

