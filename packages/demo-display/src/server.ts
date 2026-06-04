import express from 'express';
import type {
  Request as ExpressRequest,
  Response as ExpressResponse,
} from 'express';
import { existsSync } from 'node:fs';
import type { Server } from 'node:http';
import { dirname, resolve as resolvePath } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { EventLog } from './event-log.ts';
import type { DisplayEvent } from './types.ts';

export type ServerHandle = {
  port: number;
  close(): Promise<void>;
};

const SSE_HEARTBEAT_MS = 15_000;

/**
 * Resolve the frontend's built-asset directory next to this module's
 * runtime location. Layout:
 *   packages/demo-display/dist/server.mjs        (this file at runtime)
 *   packages/demo-display/dist-frontend/         (target)
 *
 * @returns The absolute path, or `undefined` if the frontend has not
 *   been built yet.
 */
function findFrontendDist(): string | undefined {
  const moduleDir = dirname(fileURLToPath(import.meta.url));
  const candidate = resolvePath(moduleDir, '../dist-frontend');
  // Sync FS check is fine here: this runs once at server startup,
  // before the HTTP listener is bound.
  // eslint-disable-next-line n/no-sync
  return existsSync(candidate) ? candidate : undefined;
}

/**
 * Validate that an incoming POST /event body looks like a `DisplayEvent`.
 *
 * Liberal: we accept any non-empty `kind` string and any well-typed
 * `at` (or none — we'll stamp it). Anything else passes through so
 * new event variants don't require server changes to surface.
 *
 * @param raw - The parsed JSON body.
 * @returns A normalized event, or an error string describing what's
 *   wrong with the body.
 */
function normalizeIncomingEvent(raw: unknown): DisplayEvent | string {
  if (raw === null || typeof raw !== 'object') {
    return 'event body must be a JSON object';
  }
  const record = raw as Record<string, unknown>;
  const { kind } = record;
  if (typeof kind !== 'string' || kind.length === 0) {
    return 'event body must have a non-empty string `kind`';
  }
  const at =
    typeof record.at === 'string' ? record.at : new Date().toISOString();
  return { ...(record as object), kind, at } as DisplayEvent;
}

/**
 * Start the demo-display HTTP server.
 *
 * Endpoints:
 *   GET  /healthz   — liveness probe
 *   GET  /events    — server-sent events stream
 *   POST /event     — ingest a single event from a trusted local source
 *                     (the openclaw demo plugin) and forward it to all
 *                     SSE subscribers
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
  // eslint-disable-next-line import-x/no-named-as-default-member
  app.use(express.json({ limit: '2mb' }));

  app.get('/healthz', (_req: ExpressRequest, res: ExpressResponse) => {
    res.status(200).type('text/plain').send('ok');
  });

  app.post('/event', (req: ExpressRequest, res: ExpressResponse) => {
    const normalized = normalizeIncomingEvent(req.body);
    if (typeof normalized === 'string') {
      res.status(400).type('text/plain').send(normalized);
      return;
    }
    eventLog.append(normalized);
    res.status(204).end();
  });

  // Serve the React SPA from the frontend's Vite build output (sibling
  // dist-frontend/ directory). Routes /events and /healthz above are
  // declared before the static middleware so they win on conflict.
  // If the frontend hasn't been built yet, skip serving statics — the
  // SSE endpoint still works; only the dashboard view is unavailable.
  const frontendDist = findFrontendDist();
  if (frontendDist !== undefined) {
    // eslint-disable-next-line import-x/no-named-as-default-member
    app.use(express.static(frontendDist, { index: 'index.html' }));
  }

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
