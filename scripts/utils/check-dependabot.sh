#!/bin/bash

# Shared utility to detect Dependabot environments
# Returns 0 (true) if running in a Dependabot environment, 1 (false) otherwise
#
# Environment variables checked:
# - DEPENDABOT: Set in the Dependabot updater environment

is_dependabot_env() {
    [ -n "$DEPENDABOT" ]
}

is_dependabot_env
