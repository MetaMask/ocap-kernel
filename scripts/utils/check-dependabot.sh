#!/bin/bash

# Shared utility to detect Dependabot environments
# Returns 0 (true) if running in a Dependabot environment, 1 (false) otherwise
#
# Environment variables checked:
# - DEPENDABOT: Set in the Dependabot updater environment
# - GITHUB_ACTOR: Set to "dependabot[bot]" in Dependabot PR workflows

is_dependabot_env() {
    [ -n "$DEPENDABOT" ] || [ "$GITHUB_ACTOR" = "dependabot[bot]" ]
}

is_dependabot_env
