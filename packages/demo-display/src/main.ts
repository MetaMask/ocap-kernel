import { loadConfig } from './config.ts';
import { makeEventLog } from './event-log.ts';
import { startServer } from './server.ts';

/**
 * Executable entry for `yarn workspace @ocap/demo-display start`.
 *
 * Loads config, starts the HTTP server, and wires graceful shutdown
 * to SIGINT / SIGTERM. The dashboard's services map is populated
 * directly from `service.discovered` events posted by the openclaw
 * discovery plugin (which carry the full matcher-returned
 * description), so demo-display no longer needs a daemon-side
 * `listAll` poll or the observer-URL redemption that used to drive
 * it.
 */
async function main(): Promise<void> {
  // eslint-disable-next-line n/no-process-env
  const config = await loadConfig({ env: process.env });

  const eventLog = makeEventLog({ capacity: config.eventLogCapacity });

  const server = await startServer({
    eventLog,
    port: config.port,
    ttydUrl: config.ttydUrl,
  });
  // eslint-disable-next-line no-console
  console.info(
    `[demo-display] Listening on http://127.0.0.1:${server.port}/events`,
  );

  const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
    // eslint-disable-next-line no-console
    console.info(`[demo-display] Received ${signal}; shutting down.`);
    try {
      await server.close();
      process.exitCode = 0;
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('[demo-display] Error during shutdown:', error);
      process.exitCode = 1;
    }
  };

  const onSignal = (signal: NodeJS.Signals): void => {
    shutdown(signal).catch((error: unknown) => {
      // eslint-disable-next-line no-console
      console.error('[demo-display] Unhandled shutdown error:', error);
      process.exitCode = 1;
    });
  };

  process.once('SIGINT', onSignal);
  process.once('SIGTERM', onSignal);
}

main().catch((error: unknown) => {
  // eslint-disable-next-line no-console
  console.error('[demo-display] Fatal:', error);
  process.exitCode = 1;
});
