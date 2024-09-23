import type { Connection } from '../src/connection.js';

export const mockConnection: Connection<null, null> = {
  open: async () => undefined,
  sendMessage: async (_) => undefined,
  setMessageHandler: (_) => undefined,
  close: async () => undefined,
};
