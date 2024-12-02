import { logError } from '@metamask/snaps-utils/node';
import type { IncomingMessage, Server, ServerResponse } from 'http';
import { createServer } from 'http';
import type { AddressInfo } from 'net';
import { resolve as resolvePath } from 'path';
import serveMiddleware from 'serve-handler';

import type { Config } from '../config.js';

/**
 * Get a static server for development purposes.
 *
 * Note: We're intentionally not using `webpack-dev-server` here because it
 * adds a lot of extra stuff to the output that we don't need, and it's
 * difficult to customize.
 *
 * @param config - The config object.
 * @returns An object with a `listen` method that returns a promise that
 * resolves when the server is listening.
 */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function getServer(config: Config) {
  if (typeof config.dir === 'undefined' || !config.dir) {
    throw new Error(`Config option 'dir' must be specified.`);
  }
  const bundleRoot = resolvePath(config.dir);
  // Only serve .bundle files
  const isAllowedPath = (path?: string): boolean =>
    typeof path === 'string' && path.endsWith('.bundle');

  /**
   * Get the response for a request. This is extracted into a function so that
   * we can easily catch errors and send a 500 response.
   *
   * @param request - The request.
   * @param response - The response.
   * @returns A promise that resolves when the response is sent.
   */
  async function getResponse(
    request: IncomingMessage,
    response: ServerResponse,
  ): Promise<void> {
    const pathname =
      request.url &&
      request.headers.host &&
      new URL(request.url, `http://${request.headers.host}`).pathname;
    const path = pathname?.slice(1);

    if (!isAllowedPath(path)) {
      response.statusCode = 404;
      response.end();
      return;
    }

    await serveMiddleware(request, response, {
      public: bundleRoot,
      directoryListing: false,
      headers: [
        {
          source: '**/*',
          headers: [
            {
              key: 'Cache-Control',
              value: 'no-cache',
            },
            {
              key: 'Access-Control-Allow-Origin',
              value: '*',
            },
          ],
        },
      ],
    });
  }

  const server = createServer((request, response) => {
    getResponse(request, response).catch(
      /* istanbul ignore next */
      (error) => {
        logError(error);
        response.statusCode = 500;
        response.end();
      },
    );
  });

  /**
   * Start the server on the port specified in the config.
   *
   * @param port - The port to listen on.
   * @returns A promise that resolves when the server is listening. The promise
   * resolves to an object with the port and the server instance. Note that if
   * the `config.server.port` is `0`, the OS will choose a random port for us,
   * so we need to get the port from the server after it starts.
   */
  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
  const listen = async (port = config.server.port) => {
    return new Promise<{
      port: number;
      server: Server;
      close: () => Promise<void>;
    }>((resolve, reject) => {
      try {
        server.listen(port, () => {
          const close = async (): Promise<void> => {
            await new Promise<void>((_resolve, _reject) => {
              server.close((closeError) => {
                if (closeError) {
                  return _reject(closeError);
                }

                return _resolve();
              });
            });
          };

          const address = server.address() as AddressInfo;
          resolve({ port: address.port, server, close });
        });
      } catch (listenError) {
        reject(listenError as Error);
      }
    });
  };

  return { listen };
}
