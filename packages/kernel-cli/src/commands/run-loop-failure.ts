import { stringify } from '@metamask/kernel-utils';
import type { Logger } from '@metamask/logger';

/** How long a post-failure shutdown may take before the process is killed. */
export const SHUTDOWN_TIMEOUT_MS = 10_000;

/** The subset of `Logger` this handler needs. */
type FailureLogger = Pick<Logger, 'error' | 'info'>;

export type RunLoopFailureHandlerOptions = {
  logger: FailureLogger;
  /** Shut the daemon down. Idempotent; concurrent calls coalesce. */
  shutdown: (reason: string) => Promise<void>;
  /** Whether there is a daemon to shut down yet. */
  isStarted: () => boolean;
  /** Whether a shutdown is already under way. */
  isShuttingDown: () => boolean;
  /** Record the failure so startup can consult it. */
  recordFailure: (failure: Error) => void;
  /** Remove the pid file. Must complete before the process exits. */
  removePidFile: () => void;
  setExitCode: (code: number) => void;
  exit: (code: number) => void;
  timeoutMs?: number;
};

/**
 * Build the daemon's run loop failure handler.
 *
 * Left alone, a dead run loop leaves the daemon answering RPCs for a kernel that
 * processes nothing — an outage only a client that reads `runLoop` in
 * `getStatus` can spot. Terminate instead, non-zero, so the failure is visible
 * and `ocap daemon start` can recover.
 *
 * Extracted from `daemon-entry` because that module shuts the process down as a
 * side effect of being imported, which leaves this logic untestable in place.
 *
 * @param options - Options bag.
 * @param options.logger - Where to record the failure.
 * @param options.shutdown - Shut the daemon down. Idempotent; calls coalesce.
 * @param options.isStarted - Whether there is a daemon to shut down yet.
 * @param options.isShuttingDown - Whether a shutdown is already under way.
 * @param options.recordFailure - Record the failure so startup can consult it.
 * @param options.removePidFile - Remove the pid file, synchronously.
 * @param options.setExitCode - Set the code the process will exit with.
 * @param options.exit - Terminate the process now.
 * @param options.timeoutMs - How long the shutdown may take before the process
 * is killed. Defaults to {@link SHUTDOWN_TIMEOUT_MS}.
 * @returns A handler suitable for `makeKernel`'s `onRunLoopFailure`.
 */
export function makeRunLoopFailureHandler({
  logger,
  shutdown,
  isStarted,
  isShuttingDown,
  recordFailure,
  removePidFile,
  setExitCode,
  exit,
  timeoutMs = SHUTDOWN_TIMEOUT_MS,
}: RunLoopFailureHandlerOptions): (failure: Error) => void {
  return (failure: Error): void => {
    recordFailure(failure);

    if (!isStarted()) {
      // No daemon to close yet. Startup either unwinds at its own check or
      // replays this failure once there is something to shut down.
      logger.error(
        'Kernel run loop died before the daemon started.',
        stringify(failure, 0),
      );
      return;
    }

    if (isShuttingDown()) {
      // Expected teardown, not an outage: don't fail a deliberate stop.
      logger.info(
        'Kernel run loop stopped during shutdown.',
        stringify(failure, 0),
      );
      return;
    }

    // `stringify` rather than `failure.stack`, which omits the cause chain. When
    // a crank dies and its rollback then fails, the rollback failure is the
    // outermost message and the error that actually killed the kernel is only
    // reachable through `cause`.
    logger.error(
      'Kernel run loop died; shutting down the daemon.',
      stringify(failure, 0),
    );
    setExitCode(1);

    // A shutdown that throws would leave the socket gone and the pid file
    // removed by `shutdown`'s own cleanup, while live vat workers keep the event
    // loop alive — an orphan holding kernel.sqlite that neither interlock can
    // see, so the next `ocap daemon start` succeeds and two kernels contend for
    // the database. A shutdown that *hangs* never reaches that cleanup, so the
    // pid file survives and the pid interlock does still see the orphan — but it
    // is an orphan either way. Terminate in both cases. `setExitCode` is not
    // enough precisely because those worker handles keep the process running.
    const exitNow = (): void => {
      try {
        removePidFile();
      } catch (rmError) {
        logger.error(
          'Could not remove the pid file before exiting.',
          stringify(rmError, 0),
        );
      }
      exit(1);
    };

    const killTimer = setTimeout(() => {
      logger.error(
        `Shutdown stalled for ${timeoutMs} ms after run loop failure; exiting now.`,
      );
      exitNow();
    }, timeoutMs);

    shutdown('run loop failure')
      .then(
        () => clearTimeout(killTimer),
        (shutdownError: unknown) => {
          clearTimeout(killTimer);
          logger.error(
            'Shutdown after run loop failure failed; exiting now.',
            stringify(shutdownError, 0),
          );
          exitNow();
        },
      )
      // Reached only if a handler above throws — a log transport out of disk
      // space, say. There is nothing further to do, and an unhandled rejection
      // here would be reported as the cause of death instead of the run loop.
      .catch(() => undefined);
  };
}
