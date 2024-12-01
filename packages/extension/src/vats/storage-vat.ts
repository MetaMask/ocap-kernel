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

import type { Baggage, ProvideObject, UserCodeExports } from '@ocap/kernel';

declare const baggage: Baggage;
declare const provideObject: ProvideObject;

type StatsValues = {
  initialized: number;
  lastAccessed: number | null;
  preferencesCount: number;
  activeSessions: number;
};

/**
 * Start function for storage vat.
 *
 * @param parameters - Initialization parameters from the vat's config object.
 * @param parameters.name - The name of the vat.
 * @returns The root object for the new vat.
 */
export async function start(parameters: {
  name?: string;
}): Promise<UserCodeExports> {
  const name = parameters?.name ?? 'storage';
  console.log(`Starting storage vat "${name}"`);

  // Utility for generating session IDs
  const generateSessionId = (): string => {
    return `session_${Date.now()}`;
  };

  // TODO: Replace with proper kernel user context
  const currentUserId = 'default-user-001';
  const currentSessionId = generateSessionId();

  // Create collection for user preferences
  const preferences =
    await baggage.createCollection<Record<string, unknown>>('preferences');
  // Create weak collection for sessions
  const sessions =
    await baggage.createWeakCollection<Record<string, unknown>>('sessions');
  // Create object for stats
  const stats = await provideObject<StatsValues>(baggage, 'stats', {
    initialized: Date.now(),
    lastAccessed: null,
    preferencesCount: 0,
    activeSessions: 0,
  });

  // User preferences management
  const setPreference = async (
    key: string,
    value: unknown,
  ): Promise<boolean> => {
    const userPreferences = (await preferences.get(currentUserId)) ?? {};
    userPreferences[key] = value;
    await preferences.init(currentUserId, userPreferences);
    stats.preferencesCount += 1;
    stats.lastAccessed = Date.now();
    return true;
  };

  // Get a preference for the current user
  const getPreference = async (key: string): Promise<unknown> => {
    const userPreferences = await preferences.get(currentUserId);
    stats.lastAccessed = Date.now();
    // We need to return "null" else the capTP will not be able to serialize the value
    // and the stream will fail, causing the multiplexer to end.
    return userPreferences?.[key] ?? null;
  };

  // Get all preferences for a user
  const getAllPreferences = async (): Promise<Record<string, unknown>> => {
    const userPreferences = await preferences.get(currentUserId);
    stats.lastAccessed = Date.now();
    return userPreferences ?? {};
  };

  // Clear all preferences for a user
  const clearPreferences = async (): Promise<boolean> => {
    await preferences.delete(currentUserId);
    stats.preferencesCount = Math.max(0, stats.preferencesCount - 1);
    stats.lastAccessed = Date.now();
    return true;
  };

  // Create a new session
  const createSession = async (
    sessionId: string,
    data: Record<string, unknown>,
  ): Promise<string> => {
    await sessions.init(sessionId, {
      created: Date.now(),
      lastAccessed: Date.now(),
      ...data,
    });
    stats.activeSessions += 1;
    return sessionId;
  };

  const getSessionId = (): string => currentSessionId;

  // Update a session
  const updateSession = async (
    sessionId: string,
    data: Record<string, unknown>,
  ): Promise<boolean> => {
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
  };

  // Get a session
  const getSession = async (
    sessionId: string,
  ): Promise<Record<string, unknown> | null> => {
    const session = await sessions.get(sessionId);
    if (session) {
      await updateSession(sessionId, {
        lastAccessed: Date.now(),
      });
    }
    return session ?? null;
  };

  // Keep a session alive
  const keepSessionAlive = async (sessionId: string): Promise<boolean> => {
    await sessions.addRef(sessionId);
    return true;
  };

  // Release a session
  const releaseSession = async (sessionId: string): Promise<boolean> => {
    await sessions.removeRef(sessionId);
    stats.activeSessions = Math.max(0, stats.activeSessions - 1);
    return true;
  };

  // Stats and diagnostics
  const getStats = (): StatsValues => {
    return {
      initialized: stats.initialized,
      lastAccessed: stats.lastAccessed,
      preferencesCount: stats.preferencesCount,
      activeSessions: stats.activeSessions,
    };
  };

  // Create a session for the current user
  await createSession(currentSessionId, { userId: currentUserId });

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
