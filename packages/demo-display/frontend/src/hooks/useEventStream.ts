import { useEffect, useState } from 'react';

import type {
  ArtifactRecordedEvent,
  DisplayEvent,
  ServiceDescriptionPayload,
} from '../types.ts';

/**
 * One entry in the agent's narration transcript. Synthesized from
 * `agent.note` events (the agent's own one-line narration) and
 * `phase.announced` events (workflow-phase transitions).
 */
export type TranscriptEntry =
  | { kind: 'note'; at: string; note: string }
  | { kind: 'phase'; at: string; phase: string };

/**
 * Aggregated view of everything the SPA cares about, reduced from
 * the SSE event stream. Components destructure what they need.
 */
export type DisplayState = {
  services: Map<string, ServiceDescriptionPayload>;
  transcript: TranscriptEntry[];
  latestArtifact: ArtifactRecordedEvent | undefined;
  walletBalanceUsd: number | undefined;
};

/**
 * Maximum number of transcript entries retained client-side. Older
 * entries fall off the front when the cap is reached. 200 fits the
 * worst-case V1 arc with headroom.
 */
const TRANSCRIPT_CAP = 200;

const INITIAL_STATE: DisplayState = {
  services: new Map(),
  transcript: [],
  latestArtifact: undefined,
  walletBalanceUsd: undefined,
};

/**
 * Connect to the demo-display SSE stream and reduce events into a
 * single `DisplayState` snapshot. One EventSource subscribes to every
 * event type we care about; the reducer is monolithic so adding a new
 * event variant only requires a new case here.
 *
 * EventSource auto-reconnects on transport drops; on reconnect the
 * server replays the recent backlog (per `event-log.ts` capacity) and
 * the reducer converges back to current state without manual
 * coordination.
 *
 * @returns The live DisplayState snapshot.
 */
export function useEventStream(): DisplayState {
  const [state, setState] = useState<DisplayState>(INITIAL_STATE);

  useEffect(() => {
    // EventSource is a stable browser API; the n-plugin lint rule
    // misreads it because it's also a newer experimental Node global.
    // eslint-disable-next-line n/no-unsupported-features/node-builtins
    const source = new EventSource('/events');

    const handle = (rawEvent: MessageEvent): void => {
      let event: DisplayEvent;
      try {
        event = JSON.parse(rawEvent.data) as DisplayEvent;
      } catch {
        return;
      }
      setState((current) => reduce(current, event));
    };

    const kinds: DisplayEvent['kind'][] = [
      'service.registered',
      'service.evicted',
      'artifact.recorded',
      'phase.announced',
      'agent.note',
      'wallet.balance',
    ];
    for (const kind of kinds) {
      source.addEventListener(kind, handle);
    }

    return () => {
      for (const kind of kinds) {
        source.removeEventListener(kind, handle);
      }
      source.close();
    };
  }, []);

  return state;
}

/**
 * Apply a single event to the current state, returning the next
 * state. Pure (no side effects); safe to call inside `setState`.
 *
 * @param state - The current state.
 * @param event - The event to apply.
 * @returns The next state.
 */
function reduce(state: DisplayState, event: DisplayEvent): DisplayState {
  switch (event.kind) {
    case 'service.registered': {
      const services = new Map(state.services);
      services.set(event.id, event.description);
      return { ...state, services };
    }
    case 'service.evicted': {
      if (!state.services.has(event.id)) {
        return state;
      }
      const services = new Map(state.services);
      services.delete(event.id);
      return { ...state, services };
    }
    case 'agent.note': {
      const transcript = appendTranscript(state.transcript, {
        kind: 'note',
        at: event.at,
        note: event.note,
      });
      return { ...state, transcript };
    }
    case 'phase.announced': {
      const transcript = appendTranscript(state.transcript, {
        kind: 'phase',
        at: event.at,
        phase: event.phase,
      });
      return { ...state, transcript };
    }
    case 'artifact.recorded':
      return { ...state, latestArtifact: event };
    case 'wallet.balance':
      return { ...state, walletBalanceUsd: event.balanceUsd };
    default:
      return state;
  }
}

/**
 * Append a transcript entry, dropping the oldest if the result would
 * exceed `TRANSCRIPT_CAP`.
 *
 * @param transcript - The current transcript.
 * @param entry - The entry to append.
 * @returns The next transcript array.
 */
function appendTranscript(
  transcript: TranscriptEntry[],
  entry: TranscriptEntry,
): TranscriptEntry[] {
  const next = [...transcript, entry];
  return next.length > TRANSCRIPT_CAP
    ? next.slice(next.length - TRANSCRIPT_CAP)
    : next;
}
