import { ifDefined } from '../misc.ts';
import type { Channel, ModalStream } from './channel.ts';
import type {
  Decision,
  ParsedInvocation,
  Provision,
  SectionNotification,
  SessionHistoryEntry,
} from './types.ts';

const SESSION_NAMES = [
  'alice',
  'bob',
  'carol',
  'dave',
  'eve',
  'frank',
  'grace',
  'heidi',
];

export type Session = {
  sessionId: string;
  ocapUrl: string;
  cwd?: string;
  startedAt: string;
  listPending(): SectionNotification[];
  listHistory(): SessionHistoryEntry[];
  decide(decision: Decision): void;
  queueRequest(description: string, reason?: string): string;
  authorizeRequest(
    description: string,
    options?: {
      reason?: string;
      timeoutMs?: number;
      invocations?: ParsedInvocation[];
    },
  ): Promise<Decision>;
  recordProvisioned(
    description: string,
    options?: { invocations?: ParsedInvocation[]; provision?: Provision },
  ): void;
  subscribe(stream: ModalStream): void;
};

export type SessionRegistry = {
  createSession(options?: { name?: string; cwd?: string }): Promise<Session>;
  getSession(sessionId: string): Session | undefined;
  listSessions(): Session[];
  /** Look up any channel by its OCAP URL — covers both session-created and vat-created channels. */
  getChannelByUrl(url: string): Channel | undefined;
};

type ChannelFactoryBundle = {
  createChannelInternal: () => Promise<{ ocapUrl: string; channel: Channel }>;
  getChannelByUrl: (url: string) => Channel | undefined;
};

/**
 * Wrap a channel as a session object.
 *
 * @param sessionId - The human-readable session name.
 * @param ocapUrl - The OCAP URL for TUI subscribers to connect to.
 * @param channel - The underlying broadcast channel.
 * @param options - Optional session metadata.
 * @param options.cwd - Working directory of the session creator.
 * @returns A {@link Session}.
 */
function makeSession(
  sessionId: string,
  ocapUrl: string,
  channel: Channel,
  { cwd }: { cwd?: string } = {},
): Session {
  let requestCount = 0;
  const startedAt = new Date().toISOString();

  const makeNotification = (
    description: string,
    reason: string,
    invocations?: ParsedInvocation[],
  ): SectionNotification => {
    const token = `req-${requestCount}`;
    requestCount += 1;
    return {
      token,
      description,
      reason,
      guard: { body: '#{}', slots: [] },
      ...ifDefined({ invocations }),
    };
  };

  return harden({
    sessionId,
    ocapUrl,
    ...ifDefined({ cwd }),
    startedAt,

    listPending(): SectionNotification[] {
      return channel.listPending();
    },

    listHistory(): SessionHistoryEntry[] {
      return channel.listAll();
    },

    decide(decision: Decision): void {
      channel.decide(decision);
    },

    queueRequest(description: string, reason = 'Queued from CLI'): string {
      const notification = makeNotification(description, reason);
      channel.broadcast(notification).catch(() => undefined);
      return notification.token;
    },

    async authorizeRequest(
      description: string,
      options: {
        reason?: string;
        timeoutMs?: number;
        invocations?: ParsedInvocation[];
      } = {},
    ): Promise<Decision> {
      const { reason = 'Queued from CLI', timeoutMs, invocations } = options;
      const notification = makeNotification(description, reason, invocations);
      const decision = channel.broadcast(notification);
      if (timeoutMs === undefined) {
        return decision;
      }
      return Promise.race([
        decision,
        new Promise<Decision>((_resolve, reject) => {
          setTimeout(() => {
            reject(
              Object.assign(
                new Error('No subscriber responded within timeout'),
                {
                  code: 'NO_SUBSCRIBER',
                },
              ),
            );
          }, timeoutMs);
        }),
      ]);
    },

    recordProvisioned(
      description: string,
      options: { invocations?: ParsedInvocation[]; provision?: Provision } = {},
    ): void {
      const notification = makeNotification(
        description,
        'Auto-accepted by provision',
        options.invocations,
      );
      channel.record(notification, options.provision);
    },

    subscribe(stream: ModalStream): void {
      channel.subscribe(stream);
    },
  });
}

/**
 * Create a session registry that maps human-readable session IDs to sessions.
 *
 * `getChannelByUrl` covers both session-created and vat-created channels because
 * all channels are stored in the factory's internal map.
 *
 * @param factory - The channel factory bundle (createChannelInternal + getChannelByUrl).
 * @returns A {@link SessionRegistry}.
 */
export function makeSessionRegistry(
  factory: ChannelFactoryBundle,
): SessionRegistry {
  let nameIndex = 0;
  const sessions = new Map<string, Session>();

  return harden({
    async createSession(
      options: { name?: string; cwd?: string } = {},
    ): Promise<Session> {
      const sessionId =
        options.name ?? SESSION_NAMES[nameIndex] ?? `session-${nameIndex}`;
      nameIndex += 1;

      const { ocapUrl, channel } = await factory.createChannelInternal();
      const session = makeSession(
        sessionId,
        ocapUrl,
        channel,
        ifDefined({ cwd: options.cwd }),
      );
      sessions.set(sessionId, session);
      return session;
    },

    getSession(sessionId: string): Session | undefined {
      return sessions.get(sessionId);
    },

    listSessions(): Session[] {
      return Array.from(sessions.values());
    },

    getChannelByUrl(url: string): Channel | undefined {
      return factory.getChannelByUrl(url);
    },
  });
}
