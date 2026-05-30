import type { DaemonCaller } from './daemon-caller.ts';
import type { EventLog } from './event-log.ts';
import type { ServiceDescriptionPayload } from './types.ts';

type ListAllEntry = {
  id: string;
  description: ServiceDescriptionPayload;
};

export type MatcherPoller = {
  stop(): void;
};

/**
 * Periodically call `listAll` on the matcher and diff successive
 * results against the last known state, appending
 * `service.registered` and `service.evicted` events to the log.
 *
 * V0 uses this poll-and-diff loop in lieu of a matcher-side push API
 * for `service.evicted`; the latter is tracked as a parallel
 * follow-up and would replace this loop with a thin subscriber.
 *
 * @param options - Construction options.
 * @param options.daemonCaller - Configured daemon caller.
 * @param options.matcherKref - Kref returned from `daemonCaller.redeemUrl`
 *   for the matcher OCAP URL.
 * @param options.intervalMs - Poll interval in ms.
 * @param options.eventLog - Event log to append diffs to.
 * @param options.now - Clock injection for tests; defaults to `Date.now`.
 * @param options.onError - Optional error sink. Defaults to logging.
 * @returns A handle exposing `stop()` to cancel future polls.
 */
export function startMatcherPoller(options: {
  daemonCaller: DaemonCaller;
  matcherKref: string;
  intervalMs: number;
  eventLog: EventLog;
  now?: () => number;
  onError?: (error: unknown) => void;
}): MatcherPoller {
  const { daemonCaller, matcherKref, intervalMs, eventLog } = options;
  const now = options.now ?? Date.now;
  const onError =
    options.onError ??
    ((error: unknown) => {
      // eslint-disable-next-line no-console
      console.warn('[demo-display] matcher poll failed:', error);
    });

  const previous = new Map<string, ServiceDescriptionPayload>();
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const tick = async (): Promise<void> => {
    try {
      const raw = await daemonCaller.queueMessage({
        target: matcherKref,
        method: 'listAll',
        args: [],
      });
      const entries = normalizeListAll(raw);
      const seen = new Set<string>();
      const at = new Date(now()).toISOString();

      for (const entry of entries) {
        seen.add(entry.id);
        if (!previous.has(entry.id)) {
          previous.set(entry.id, entry.description);
          eventLog.append({
            kind: 'service.registered',
            id: entry.id,
            description: entry.description,
            at,
          });
        }
      }

      for (const knownId of [...previous.keys()]) {
        if (!seen.has(knownId)) {
          previous.delete(knownId);
          eventLog.append({ kind: 'service.evicted', id: knownId, at });
        }
      }
    } catch (error) {
      onError(error);
    }
  };

  const runAndSchedule = (): void => {
    if (stopped) {
      return;
    }
    const scheduleNext = (): undefined => {
      if (!stopped) {
        timer = setTimeout(runAndSchedule, intervalMs);
      }
      return undefined;
    };
    // tick() already catches its own errors via onError, so it does not
    // reject. The chain below is fire-and-forget: this function is
    // synchronous and the next iteration is driven by setTimeout.
    tick().then(scheduleNext).catch(scheduleNext);
  };

  // Kick off the first poll immediately so a fresh client sees the
  // current registry without waiting for the first interval.
  runAndSchedule();

  return {
    stop(): void {
      stopped = true;
      if (timer !== undefined) {
        clearTimeout(timer);
        timer = undefined;
      }
    },
  };
}

/**
 * Validate the shape of `listAll`'s return value (array of {id, description}).
 *
 * Defensive because the daemon round-trip returns raw JSON; a malformed
 * payload would otherwise crash the poller.
 *
 * @param raw - The parsed JSON returned by `listAll`.
 * @returns The validated array.
 */
function normalizeListAll(raw: unknown): ListAllEntry[] {
  if (!Array.isArray(raw)) {
    throw new Error('listAll: expected an array of entries');
  }
  return raw.map((entry) => {
    if (
      entry === null ||
      typeof entry !== 'object' ||
      typeof (entry as { id: unknown }).id !== 'string' ||
      typeof (entry as { description: unknown }).description !== 'object'
    ) {
      throw new Error('listAll: entry missing id or description');
    }
    return entry as ListAllEntry;
  });
}
