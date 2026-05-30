import express from 'express';
import type {
  Request as ExpressRequest,
  Response as ExpressResponse,
} from 'express';
import type { Server } from 'node:http';

import type { EventLog } from './event-log.ts';

export type ServerHandle = {
  port: number;
  close(): Promise<void>;
};

const SSE_HEARTBEAT_MS = 15_000;

/**
 * Start the demo-display HTTP server.
 *
 * Endpoints:
 *   GET /healthz   — liveness probe
 *   GET /events    — server-sent events stream
 *
 * On `/events`, the server first writes the recent backlog from the
 * event log so a freshly connected client lands with current state,
 * then forwards each appended event live. A periodic comment line is
 * written to keep intermediaries from closing idle connections.
 *
 * @param options - Construction options.
 * @param options.eventLog - Event log to subscribe to.
 * @param options.port - TCP port to bind. Pass 0 to bind an ephemeral
 *   port (useful in tests); the resolved port is returned on the
 *   handle.
 * @returns A handle exposing the bound port and a `close()` method.
 */
export async function startServer(options: {
  eventLog: EventLog;
  port: number;
}): Promise<ServerHandle> {
  const { eventLog, port } = options;
  const app = express();

  app.get('/healthz', (_req: ExpressRequest, res: ExpressResponse) => {
    res.status(200).type('text/plain').send('ok');
  });

  app.get('/events', (req: ExpressRequest, res: ExpressResponse) => {
    res.status(200);
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    const write = (event: { kind: string; data: unknown }): void => {
      res.write(`event: ${event.kind}\n`);
      res.write(`data: ${JSON.stringify(event.data)}\n\n`);
    };

    for (const event of eventLog.recent()) {
      write({ kind: event.kind, data: event });
    }

    const unsubscribe = eventLog.subscribe((event) => {
      write({ kind: event.kind, data: event });
    });

    const heartbeat = setInterval(() => {
      res.write(`: heartbeat\n\n`);
    }, SSE_HEARTBEAT_MS);

    req.once('close', () => {
      clearInterval(heartbeat);
      unsubscribe();
    });
  });

  const server: Server = await new Promise((resolve) => {
    const httpServer = app.listen(port, () => resolve(httpServer));
  });

  const address = server.address();
  const boundPort =
    address && typeof address === 'object' ? address.port : port;

  return {
    port: boundPort,
    async close(): Promise<void> {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        });
      });
    },
  };
}
