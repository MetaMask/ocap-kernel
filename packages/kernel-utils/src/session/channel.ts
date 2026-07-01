import { makePromiseKit } from '@endo/promise-kit';
import type { PromiseKit } from '@endo/promise-kit';

import { ifDefined } from '../misc.ts';
import type {
  Decision,
  Provision,
  SectionNotification,
  SessionHistoryEntry,
} from './types.ts';

/**
 * Structural type for a stream that carries {@link SectionNotification}
 * outbound and {@link Decision} inbound. `NodeSocketDuplexStream` from
 * `@metamask/streams` satisfies this interface; we avoid importing it here to
 * prevent a circular dependency (streams → kernel-utils → streams).
 */
export type ModalStream = {
  write(value: SectionNotification): Promise<unknown>;
} & AsyncIterable<Decision>;

/**
 * A broadcast channel that fans {@link SectionNotification} messages out to
 * connected modal subscribers and returns a {@link Decision} promise to the
 * caller.
 */
export type Channel = {
  /**
   * Broadcast a notification to all connected subscribers and return a promise
   * that resolves when any subscriber submits a matching decision.
   *
   * @param notification - The section notification to broadcast.
   * @returns A promise for the subscriber's decision.
   */
  broadcast(notification: SectionNotification): Promise<Decision>;

  /**
   * Register a modal subscriber stream. Immediately starts draining the stream
   * for incoming decisions and replays all currently-pending notifications to
   * the new subscriber.
   *
   * @param stream - The modal stream to subscribe.
   */
  subscribe(stream: ModalStream): void;

  /**
   * Return all notifications that have been broadcast but not yet decided.
   *
   * @returns Array of pending notifications, oldest first.
   */
  listPending(): SectionNotification[];

  /**
   * Return all requests — both pending and decided — sorted chronologically.
   *
   * @returns Array of {@link SessionHistoryEntry} oldest first.
   */
  listAll(): SessionHistoryEntry[];

  /**
   * Return the latest activity timestamp on this channel — the maximum of all
   * pending `queuedAt` and history `queuedAt`/`decidedAt` values. Returns
   * undefined if no requests have ever been queued.
   *
   * @returns ISO 8601 timestamp of the most recent activity, or undefined.
   */
  lastActiveAt(): string | undefined;

  /**
   * Resolve or reject the pending promise for the given token, as if a
   * subscriber had submitted the decision. No-op if the token is unknown.
   *
   * @param decision - The decision to apply.
   */
  decide(decision: Decision): void;

  /**
   * Record a notification as already decided by a standing provision, without
   * routing it through `pending` or notifying subscribers.
   *
   * @param notification - The section notification to record.
   * @param provisions - The standing provisions that approved the request (one per clause).
   */
  record(notification: SectionNotification, provisions?: Provision[]): void;
};

type PendingEntry = {
  kit: PromiseKit<Decision>;
  notification: SectionNotification;
  queuedAt: string;
};

type HistoryEntry = {
  notification: SectionNotification;
  queuedAt: string;
  verdict: 'accepted' | 'rejected' | 'provisioned';
  decidedAt: string;
  provisions?: Provision[];
};

/**
 * Create a broadcast channel for session authorization requests.
 *
 * The channel fans notifications to all connected subscribers and correlates
 * responses back to the originating broadcast call via token. Any subscriber
 * that connects while notifications are still pending receives a replay of
 * all undecided notifications, regardless of whether earlier subscribers have
 * already received them.
 *
 * @returns A {@link Channel}.
 */
export function makeChannel(): Channel {
  const pending = new Map<string, PendingEntry>();
  const history: HistoryEntry[] = [];
  const subscribers: ModalStream[] = [];

  /**
   * Route an incoming decision to its waiting broadcast caller.
   *
   * @param decision - The decision from a subscriber.
   */
  function routeDecision(decision: Decision): void {
    const entry = pending.get(decision.token);
    if (entry === undefined) {
      return;
    }
    pending.delete(decision.token);
    history.push({
      notification: entry.notification,
      queuedAt: entry.queuedAt,
      verdict: decision.verdict === 'accept' ? 'accepted' : 'rejected',
      decidedAt: new Date().toISOString(),
      ...ifDefined({ provisions: decision.provisions }),
    });
    entry.kit.resolve(decision);
  }

  /**
   * Drain a subscriber stream, routing decisions to pending callers.
   * On stream end or error, rejects any remaining pending entries that have no
   * other subscribers left to answer them.
   *
   * @param stream - The subscriber stream to drain.
   */
  async function drainSubscriber(stream: ModalStream): Promise<void> {
    let drainError: Error | undefined;
    try {
      for await (const decision of stream) {
        routeDecision(decision);
      }
    } catch (error) {
      drainError = error instanceof Error ? error : new Error(String(error));
    } finally {
      const idx = subscribers.indexOf(stream);
      if (idx !== -1) {
        subscribers.splice(idx, 1);
      }
      if (subscribers.length === 0 && pending.size > 0) {
        const rejectError =
          drainError ?? new Error('All subscribers disconnected');
        for (const [token, entry] of pending) {
          pending.delete(token);
          entry.kit.reject(rejectError);
        }
      }
    }
  }

  return harden({
    async broadcast(notification: SectionNotification): Promise<Decision> {
      const kit = makePromiseKit<Decision>();
      pending.set(notification.token, {
        kit,
        notification,
        queuedAt: new Date().toISOString(),
      });
      for (const stream of [...subscribers]) {
        stream.write(notification).catch(() => undefined);
      }
      return kit.promise;
    },

    subscribe(stream: ModalStream): void {
      subscribers.push(stream);
      // Replay all undecided notifications so this subscriber sees any requests
      // that arrived before it connected or while a previous subscriber held them.
      for (const { notification } of pending.values()) {
        stream.write(notification).catch(() => undefined);
      }
      drainSubscriber(stream).catch(() => undefined);
    },

    listPending(): SectionNotification[] {
      return Array.from(pending.values()).map((entry) => entry.notification);
    },

    listAll(): SessionHistoryEntry[] {
      const decided: SessionHistoryEntry[] = history.map((hist) => ({
        token: hist.notification.token,
        description: hist.notification.description,
        reason: hist.notification.reason,
        guard: hist.notification.guard,
        queuedAt: hist.queuedAt,
        status: hist.verdict,
        decidedAt: hist.decidedAt,
        ...ifDefined({ invocations: hist.notification.invocations }),
        ...ifDefined({ clauses: hist.notification.clauses }),
        ...ifDefined({ provisions: hist.provisions }),
      }));
      const stillPending: SessionHistoryEntry[] = Array.from(
        pending.values(),
      ).map((pend) => ({
        token: pend.notification.token,
        description: pend.notification.description,
        reason: pend.notification.reason,
        guard: pend.notification.guard,
        queuedAt: pend.queuedAt,
        status: 'pending' as const,
        ...ifDefined({ invocations: pend.notification.invocations }),
        ...ifDefined({ clauses: pend.notification.clauses }),
      }));
      return [...decided, ...stillPending].sort((lhs, rhs) => {
        if (lhs.queuedAt < rhs.queuedAt) {
          return -1;
        }
        if (lhs.queuedAt > rhs.queuedAt) {
          return 1;
        }
        return 0;
      });
    },

    decide(decision: Decision): void {
      routeDecision(decision);
    },

    lastActiveAt(): string | undefined {
      let latest: string | undefined;
      const consider = (stamp: string): void => {
        if (latest === undefined || stamp > latest) {
          latest = stamp;
        }
      };
      for (const entry of pending.values()) {
        consider(entry.queuedAt);
      }
      for (const entry of history) {
        consider(entry.queuedAt);
        consider(entry.decidedAt);
      }
      return latest;
    },

    record(notification: SectionNotification, provisions?: Provision[]): void {
      const stamp = new Date().toISOString();
      history.push({
        notification,
        queuedAt: stamp,
        verdict: 'provisioned',
        decidedAt: stamp,
        ...ifDefined({ provisions }),
      });
    },
  });
}
