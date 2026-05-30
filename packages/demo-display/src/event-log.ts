import type { DisplayEvent } from './types.ts';

export type EventSubscriber = (event: DisplayEvent) => void;

export type EventLog = {
  append(event: DisplayEvent): void;
  recent(): DisplayEvent[];
  subscribe(subscriber: EventSubscriber): () => void;
};

/**
 * Create an in-memory event log with bounded retention and a fanout list.
 *
 * Events are appended on `append`, forwarded to every live subscriber,
 * and retained up to `capacity` so a new SSE client can replay recent
 * activity on connect.
 *
 * @param options - Construction options.
 * @param options.capacity - Maximum number of events to retain for replay.
 *   Default 200.
 * @returns The event log.
 */
export function makeEventLog(options: { capacity?: number } = {}): EventLog {
  const capacity = options.capacity ?? 200;
  const buffer: DisplayEvent[] = [];
  const subscribers = new Set<EventSubscriber>();

  return {
    append(event: DisplayEvent): void {
      buffer.push(event);
      if (buffer.length > capacity) {
        buffer.splice(0, buffer.length - capacity);
      }
      for (const subscriber of subscribers) {
        try {
          subscriber(event);
        } catch {
          // A failing subscriber must not block other subscribers from
          // receiving the event; the SSE writer can fail mid-send if a
          // client disconnects between writes.
        }
      }
    },

    recent(): DisplayEvent[] {
      return [...buffer];
    },

    subscribe(subscriber: EventSubscriber): () => void {
      subscribers.add(subscriber);
      return () => {
        subscribers.delete(subscriber);
      };
    },
  };
}
