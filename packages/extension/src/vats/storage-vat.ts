/**
 * Storage Vat - Persistent Data Management System
 *
 * This vat provides a persistent storage system with two main functionalities:
 * 1. User Preferences Storage: A permanent key-value store for user-specific settings
 *    and preferences that persist across sessions.
 * 2. Session Management: A temporary storage system for managing active sessions,
 *    implemented as a weak collection that allows sessions to be garbage collected
 *    when no longer referenced.
 *
 * Sessions are temporary storage containers that:
 * - Have a defined lifecycle (creation, updates, and release)
 * - Automatically track creation and last accessed timestamps
 * - Can be kept alive through explicit reference management
 * - Are automatically cleaned up when all references are released
 *
 * The vat also maintains statistics about its usage, including:
 * - Initialization time
 * - Last access timestamp
 * - Count of stored preferences
 * - Number of active sessions
 *
 * NOTE: In a production environment, the currentUserId would typically be provided
 * by the kernel's user context management system. For this implementation, we're
 * using a static default user ID for testing and development purposes.
 *
 * @module storage-vat
 */

import type { Json } from '@metamask/utils';
import type {
  Baggage,
  ProvideObject,
  UserCodeExports,
  WeakCollection,
} from '@ocap/kernel';

declare const baggage: Baggage;
declare const provideObject: ProvideObject;

type StatsValues = {
  initialized: number;
  lastAccessed: number | null;
  preferencesCount: number;
  activeSessions: number;
};

type UserPreferences = Record<string, string>;

// Add type definitions
type SessionData = {
  created: number;
  lastAccessed: number;
  userId: string;
  [key: string]: Json;
};

/**
 * Start function for storage vat.
 *
 * @param parameters - Initialization parameters from the vat's config object.
 * @param parameters.name - The name of the vat.
 * @returns The root object for the new vat.
 */
export function start(parameters: { name?: string }): UserCodeExports {
  const name = parameters?.name ?? 'storage';
  console.log(`Starting storage vat "${name}"`);

  const currentUserId = 'default-user-001';
  const currentSessionId = `session_${Date.now()}`;

  // Create weak collection for sessions
  let sessions: WeakCollection<SessionData>;
  baggage
    .createWeakCollection<SessionData>('sessions')
    .then(async (sess) => {
      sessions = sess;
      // Create a session for the current user
      return await createSession(currentSessionId, { userId: currentUserId });
    })
    .catch((error) => {
      console.error('Error creating sessions collection', error);
    });

  // Create object for stats
  let stats: StatsValues;
  provideObject<StatsValues>(baggage, 'stats', {
    initialized: Date.now(),
    lastAccessed: null,
    preferencesCount: 0,
    activeSessions: 0,
  })
    .then((stat) => {
      stats = stat;
      return stat;
    })
    .catch((error) => {
      console.error('Error creating stats object', error);
    });

  /**
   * Set a preference for the current user
   *
   * @param key - The key of the preference to set.
   * @param value - The value of the preference to set.
   * @returns True if the preference was set successfully.
   */
  async function setPreference(key: string, value: string): Promise<boolean> {
    const userPreferences =
      (await baggage.get<UserPreferences>(currentUserId)) ?? {};
    userPreferences[key] = value;
    await baggage.set(currentUserId, userPreferences);
    stats.preferencesCount += 1;
    stats.lastAccessed = Date.now();
    return true;
  }

  /**
   * Get a preference for the current user
   *
   * @param key - The key of the preference to get.
   * @returns The preference value.
   */
  async function getPreference(key: string): Promise<unknown> {
    const userPreferences =
      (await baggage.get<UserPreferences>(currentUserId)) ?? {};
    stats.lastAccessed = Date.now();
    // We need to return "null" else the capTP will not be able to serialize the value
    // and the stream will fail, causing the multiplexer to end.
    return userPreferences?.[key] ?? null;
  }

  /**
   * Get all preferences for a user
   *
   * @returns The preferences for the user.
   */
  async function getAllPreferences(): Promise<Record<string, unknown>> {
    const userPreferences = await baggage.get<UserPreferences>(currentUserId);
    stats.lastAccessed = Date.now();
    return userPreferences ?? {};
  }

  /**
   * Clear all preferences for a user
   *
   * @returns True if the preferences were cleared successfully.
   */
  async function clearPreferences(): Promise<boolean> {
    await baggage.delete(currentUserId);
    stats.preferencesCount = Math.max(0, stats.preferencesCount - 1);
    stats.lastAccessed = Date.now();
    return true;
  }

  /**
   * Create a new session
   *
   * @param sessionId - The id of the session.
   * @param data - The data to store in the session.
   * @returns The id of the created session.
   */
  async function createSession(
    sessionId: string,
    data: Record<string, unknown>,
  ): Promise<string> {
    const parsedData = typeof data === 'string' ? JSON.parse(data) : data;
    await sessions.init(sessionId, {
      created: Date.now(),
      lastAccessed: Date.now(),
      userId: currentUserId,
      ...parsedData,
    });
    stats.activeSessions += 1;
    return sessionId;
  }

  /**
   * Get the current session id
   *
   * @returns The id of the current session.
   */
  function getSessionId(): string {
    return currentSessionId;
  }

  /**
   * Update a session
   *
   * @param sessionId - The id of the session to update.
   * @param data - The data to update the session with.
   * @returns True if the session was updated successfully.
   */
  async function updateSession(
    sessionId: string,
    data: Record<string, unknown>,
  ): Promise<boolean> {
    const session = await sessions.get(sessionId);
    if (!session) {
      return false;
    }

    await sessions.init(sessionId, {
      ...session,
      ...data,
      lastAccessed: Date.now(),
    });
    return true;
  }

  /**
   * Get a session
   *
   * @param sessionId - The id of the session to get.
   * @returns The session data.
   */
  async function getSession(
    sessionId: string,
  ): Promise<Record<string, unknown> | null> {
    const session = await sessions.get(sessionId);
    if (session) {
      await updateSession(sessionId, {
        lastAccessed: Date.now(),
      });
    }
    return session ?? null;
  }

  /**
   * Keep a session alive
   *
   * @param sessionId - The id of the session to keep alive.
   * @returns True if the session was kept alive successfully.
   */
  async function keepSessionAlive(sessionId: string): Promise<boolean> {
    await sessions.addRef(sessionId);
    return true;
  }

  /**
   * Release a session
   *
   * @param sessionId - The id of the session to release.
   * @returns True if the session was released successfully.
   */
  async function releaseSession(sessionId: string): Promise<boolean> {
    await sessions.removeRef(sessionId);
    stats.activeSessions = Math.max(0, stats.activeSessions - 1);
    return true;
  }

  /**
   * Get the stats of the vat
   *
   * @returns The stats of the vat.
   */
  function getStats(): StatsValues {
    return {
      initialized: stats.initialized,
      lastAccessed: stats.lastAccessed,
      preferencesCount: stats.preferencesCount,
      activeSessions: stats.activeSessions,
    };
  }

  return {
    name,
    methods: {
      setPreference,
      getPreference,
      getAllPreferences,
      clearPreferences,
      createSession,
      getSessionId,
      updateSession,
      getSession,
      keepSessionAlive,
      releaseSession,
      getStats,
    },
  } as UserCodeExports;
}
