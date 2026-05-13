import type { Channel, ModalStream } from './channel.ts';
import type { Decision, SectionNotification } from './types.ts';

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
  listPending(): SectionNotification[];
  decide(decision: Decision): void;
  queueRequest(description: string, reason?: string): string;
  subscribe(stream: ModalStream): void;
};

export type SessionRegistry = {
  createSession(name?: string): Promise<Session>;
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
 * @returns A {@link Session}.
 */
function makeSession(
  sessionId: string,
  ocapUrl: string,
  channel: Channel,
): Session {
  let requestCount = 0;

  return harden({
    sessionId,
    ocapUrl,

    listPending(): SectionNotification[] {
      return channel.listPending();
    },

    decide(decision: Decision): void {
      channel.decide(decision);
    },

    queueRequest(description: string, reason = 'Queued from CLI'): string {
      const token = `req-${requestCount}`;
      requestCount += 1;
      channel
        .broadcast({
          token,
          description,
          reason,
          guard: { body: '#{}', slots: [] },
        })
        .catch(() => undefined);
      return token;
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
    async createSession(name?: string): Promise<Session> {
      const sessionId =
        name ?? SESSION_NAMES[nameIndex] ?? `session-${nameIndex}`;
      nameIndex += 1;

      const { ocapUrl, channel } = await factory.createChannelInternal();
      const session = makeSession(sessionId, ocapUrl, channel);
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
