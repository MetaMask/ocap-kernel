import { loadConfig } from './config.ts';
import { makeDaemonCaller } from './daemon-caller.ts';
import { makeEventLog } from './event-log.ts';
import { startMatcherPoller } from './matcher-poller.ts';
import { startServer } from './server.ts';

/**
 * Executable entry for `yarn workspace @ocap/demo-display start`.
 *
 * Loads config, redeems the matcher's observer URL once via the ocap
 * CLI to obtain a kref, starts the poll loop and the HTTP server, and
 * wires graceful shutdown to SIGINT / SIGTERM.
 */
async function main(): Promise<void> {
  // eslint-disable-next-line n/no-process-env
  const config = await loadConfig({ env: process.env });

  const daemonCaller = makeDaemonCaller({
    cliPath: config.ocapCliPath,
    ocapHome: config.ocapHome,
    timeoutMs: config.timeoutMs,
  });

  const observerKref = await daemonCaller.redeemUrl(config.observerUrl);
  // eslint-disable-next-line no-console
  console.info(`[demo-display] Redeemed observer URL; kref=${observerKref}`);

  const eventLog = makeEventLog({ capacity: config.eventLogCapacity });

  const poller = startMatcherPoller({
    daemonCaller,
    observerKref,
    intervalMs: config.pollIntervalMs,
    eventLog,
  });

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
    poller.stop();
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
