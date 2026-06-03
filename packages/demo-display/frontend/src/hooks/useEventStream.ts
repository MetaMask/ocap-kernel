import { useEffect, useState } from 'react';

import type { DisplayEvent, ServiceDescriptionPayload } from '../types.ts';

/**
 * Connect to the demo-display SSE stream and maintain a live map of
 * the currently-registered services. Resolves the in-memory state by
 * reducing `service.registered` (add) and `service.evicted` (remove)
 * events as they arrive.
 *
 * The hook opens an `EventSource` against `/events` once and subscribes
 * to the two named event types. EventSource auto-reconnects on
 * transport drops; on reconnect, the server replays the recent backlog
 * (per `event-log.ts` capacity) so the client converges back to current
 * state without manual coordination.
 *
 * @returns A live map keyed by registry id (`svc:N`). Values are the
 *   ServiceDescriptionPayload that came in with the matching
 *   `service.registered` event.
 */
export function useEventStream(): Map<string, ServiceDescriptionPayload> {
  const [services, setServices] = useState<
    Map<string, ServiceDescriptionPayload>
  >(new Map());

  useEffect(() => {
    // EventSource is a stable browser API; the n-plugin lint rule
    // misreads it because it's also a newer experimental Node global.
    // eslint-disable-next-line n/no-unsupported-features/node-builtins
    const source = new EventSource('/events');

    const handleRegistered = (rawEvent: MessageEvent): void => {
      try {
        const event = JSON.parse(rawEvent.data) as DisplayEvent;
        if (event.kind !== 'service.registered') {
          return;
        }
        setServices((current) => {
          const next = new Map(current);
          next.set(event.id, event.description);
          return next;
        });
      } catch {
        // Malformed payload — skip the event rather than crash the
        // stream.
      }
    };

    const handleEvicted = (rawEvent: MessageEvent): void => {
      try {
        const event = JSON.parse(rawEvent.data) as DisplayEvent;
        if (event.kind !== 'service.evicted') {
          return;
        }
        setServices((current) => {
          if (!current.has(event.id)) {
            return current;
          }
          const next = new Map(current);
          next.delete(event.id);
          return next;
        });
      } catch {
        // Same as above.
      }
    };

    source.addEventListener('service.registered', handleRegistered);
    source.addEventListener('service.evicted', handleEvicted);

    return () => {
      source.removeEventListener('service.registered', handleRegistered);
      source.removeEventListener('service.evicted', handleEvicted);
      source.close();
    };
  }, []);

  return services;
}
