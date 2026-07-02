#!/usr/bin/env bash
# Reap orphan daemon-entry processes for a given OCAP_HOME.
#
# `daemon stop` only kills the PID recorded in daemon.pid; earlier
# runs that raced or didn't shut down cleanly can leave additional
# daemon-entry processes alive for the same home, each holding a
# stale kernel.sqlite and (in the matcher/services case) registered
# against the network under a different peer ID. Over many
# rehearsals the host accumulates orphans that clutter `ps` output,
# hold sockets, and cause the "duplicate peer" symptoms we
# encountered mid-rehearsal.
#
# This script targets precisely one OCAP_HOME: it inspects every
# daemon-entry.mjs process's OCAP_SOCKET_PATH env var (set by the
# spawn) and kills only those whose socket path matches the home
# passed on the command line. Daemons under other homes on the same
# host (matcher vs consumer vs services) are left alone.
#
# Usage:
#   reap-daemon-orphans.sh <ocap-home>
#
# Example:
#   reap-daemon-orphans.sh ~/.ocap-consumer

set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "Usage: $0 <ocap-home>" >&2
  exit 2
fi

HOME_DIR="$1"
EXPECTED_SOCKET="$HOME_DIR/daemon.sock"

info() { echo "[reap-orphans] $*" >&2; }

if ! pgrep -f daemon-entry.mjs >/dev/null 2>&1; then
  # No daemon-entry processes anywhere; nothing to consider.
  exit 0
fi

ALL_PIDS="$(pgrep -f daemon-entry.mjs || true)"
ORPHANS=""
for PID in $ALL_PIDS; do
  # Linux: /proc/<pid>/environ; macOS: `ps eww` carries env in argv tail.
  SOCK=""
  if [[ -r "/proc/$PID/environ" ]]; then
    SOCK="$(tr '\0' '\n' < "/proc/$PID/environ" 2>/dev/null \
            | sed -n 's/^OCAP_SOCKET_PATH=//p')"
  else
    SOCK="$(ps -p "$PID" -E -o command= 2>/dev/null \
            | tr ' ' '\n' | sed -n 's/^OCAP_SOCKET_PATH=//p' | head -1)"
  fi
  if [[ "$SOCK" == "$EXPECTED_SOCKET" ]]; then
    ORPHANS="$ORPHANS $PID"
  fi
done

if [[ -z "$ORPHANS" ]]; then
  exit 0
fi

info "Reaping orphan daemons for $HOME_DIR:$ORPHANS"
# SIGTERM first so signal handlers can log shutdown; SIGKILL fallback.
for PID in $ORPHANS; do kill "$PID" 2>/dev/null || true; done
sleep 1
for PID in $ORPHANS; do kill -KILL "$PID" 2>/dev/null || true; done

# Sweep stale socket/pid files left behind by the killed daemons.
# The interlock in `daemon start` checks these up front.
rm -f "$HOME_DIR/daemon.sock" "$HOME_DIR/daemon.pid"
