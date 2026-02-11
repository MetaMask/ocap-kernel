import type { Logger } from '@metamask/logger';
import type { IncomingMessage, Server, ServerResponse } from 'node:http';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';

import type { InvocationKernel } from './url-invocation.ts';
import { handleURLInvocation } from './url-invocation.ts';

/**
 * Read the entire body of an HTTP request as a string.
 *
 * @param request - The incoming HTTP request.
 * @returns A promise for the request body string.
 */
async function readBody(request: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    request.on('data', (chunk: Buffer) => chunks.push(chunk));
    request.on('end', () => resolve(Buffer.concat(chunks).toString()));
    request.on('error', reject);
  });
}

/**
 * Create an HTTP server that accepts OCAP URL invocation requests.
 *
 * The server exposes a single POST endpoint that accepts `{ url: string }`
 * and returns the JSON-serialized invocation result.
 *
 * @param kernel - The kernel instance to invoke against.
 * @param logger - Optional logger.
 * @returns An object with `listen` and `close` methods.
 */
export function createHTTPInvocationServer(
  kernel: InvocationKernel,
  logger?: Logger,
): {
  listen: (
    port: number,
  ) => Promise<{ port: number; server: Server; close: () => Promise<void> }>;
} {
  /**
   * @param request - The incoming HTTP request.
   * @param response - The server response.
   */
  async function handleRequest(
    request: IncomingMessage,
    response: ServerResponse,
  ): Promise<void> {
    if (request.method !== 'POST') {
      response.writeHead(405, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ error: 'Method not allowed' }));
      return;
    }

    const body = await readBody(request);
    let parsed: { url?: unknown };
    try {
      parsed = JSON.parse(body) as { url?: unknown };
    } catch {
      response.writeHead(400, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ error: 'Invalid JSON' }));
      return;
    }

    if (typeof parsed.url !== 'string') {
      response.writeHead(400, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ error: 'Missing or invalid "url" field' }));
      return;
    }

    try {
      const result = await handleURLInvocation(parsed.url, kernel);
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify(result));
    } catch (error) {
      logger?.error('Invocation error:', error);
      const message = error instanceof Error ? error.message : 'Unknown error';
      response.writeHead(500, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ error: message }));
    }
  }

  const server = createServer((request, response) => {
    handleRequest(request, response).catch((error) => {
      logger?.error('Unhandled request error:', error);
      response.writeHead(500, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ error: 'Internal server error' }));
    });
  });

  /**
   * Start the server on the given port.
   *
   * @param port - The port to listen on. Use 0 for a random available port.
   * @returns A promise that resolves with the port, server, and close function.
   */
  const listen = async (
    port: number,
  ): Promise<{ port: number; server: Server; close: () => Promise<void> }> => {
    return new Promise((resolve, reject) => {
      try {
        server.listen(port, () => {
          const address = server.address() as AddressInfo;
          const close = async (): Promise<void> =>
            new Promise((resolveClose, rejectClose) =>
              server.close((problem) =>
                problem ? rejectClose(problem) : resolveClose(),
              ),
            );
          resolve({ port: address.port, server, close });
        });
      } catch (listenError) {
        reject(listenError as Error);
      }
    });
  };

  return { listen };
}
