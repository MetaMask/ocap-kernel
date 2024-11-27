/* eslint-disable no-undef */

/**
 * Start function for storage vat.
 *
 * @param {unknown} parameters - Initialization parameters from the vat's config object.
 * @returns {unknown} The root object for the new vat.
 */
export async function start(parameters) {
  const name = parameters?.name ?? 'storage';
  console.log(`Starting storage vat "${name}"`);

  const preferences = await baggage.createCollection('preferences');
  const sessions = await baggage.createWeakCollection('sessions');
  const stats = await provideObject(baggage, 'stats', {
    initialized: Date.now(),
    lastAccessed: null,
    preferencesCount: 0,
    activeSessions: 0,
  });

  return {
    name,

    // User preferences management
    async setPreference(userId, key, value) {
      const userPreferences = (await preferences.get(userId)) || {};
      userPreferences[key] = value;
      await preferences.init(userId, userPreferences);
      stats.preferencesCount += 1;
      stats.lastAccessed = Date.now();
      return true;
    },

    async getPreference(userId, key) {
      const userPreferences = await preferences.get(userId);
      stats.lastAccessed = Date.now();
      return userPreferences?.[key];
    },

    async getAllPreferences(userId) {
      const userPreferences = await preferences.get(userId);
      stats.lastAccessed = Date.now();
      return userPreferences || {};
    },

    async clearPreferences(userId) {
      await preferences.delete(userId);
      stats.preferencesCount = Math.max(0, stats.preferencesCount - 1);
      stats.lastAccessed = Date.now();
      return true;
    },

    // Session management
    async createSession(sessionId, data) {
      await sessions.init(sessionId, {
        created: Date.now(),
        lastAccessed: Date.now(),
        ...data,
      });
      stats.activeSessions += 1;
      return true;
    },

    async updateSession(sessionId, data) {
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
    },

    async getSession(sessionId) {
      const session = await sessions.get(sessionId);
      if (session) {
        await this.updateSession(sessionId, { lastAccessed: Date.now() });
      }
      return session;
    },

    async keepSessionAlive(sessionId) {
      await sessions.addRef(sessionId);
      return true;
    },

    async releaseSession(sessionId) {
      await sessions.removeRef(sessionId);
      stats.activeSessions = Math.max(0, stats.activeSessions - 1);
      return true;
    },

    // Stats and diagnostics
    getStats() {
      return {
        initialized: stats.initialized,
        lastAccessed: stats.lastAccessed,
        preferencesCount: stats.preferencesCount,
        activeSessions: stats.activeSessions,
      };
    },
  };
}
