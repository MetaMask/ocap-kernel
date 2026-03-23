import { readFile } from 'node:fs/promises';

/**
 * Read a PID from a file.
 *
 * @param pidPath - The PID file path.
 * @returns The PID, or undefined if the file is missing or invalid.
 */
export async function readPidFile(
  pidPath: string,
): Promise<number | undefined> {
  try {
    const pid = Number(await readFile(pidPath, 'utf-8'));
    return pid > 0 && !Number.isNaN(pid) ? pid : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Check whether a process is alive by sending signal 0.
 *
 * @param pid - The process ID to check.
 * @returns True if the process exists.
 */
export function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Poll until a condition is met or the timeout elapses.
 *
 * @param check - A function that returns true when the condition is met.
 * @param timeoutMs - Maximum time to wait in milliseconds.
 * @returns True if the condition was met, false on timeout.
 */
export async function waitFor(
  check: () => boolean | Promise<boolean>,
  timeoutMs: number,
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await check()) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return await check();
}

/**
 * Wrap a promise with a timeout rejection.
 *
 * @param promise - The promise to wrap with a timeout.
 * @param timeout - How many ms to wait before rejecting.
 * @returns A wrapped promise which rejects after timeout miliseconds.
 */
export async function withTimeout<Return>(
  promise: Promise<Return>,
  timeout: number,
): Promise<Return> {
  return Promise.race([
    promise,
    new Promise((_resolve, reject) =>
      setTimeout(
        () =>
          reject(
            new Error(`promise timed out after ${timeout}ms`, {
              cause: promise,
            }),
          ),
        timeout,
      ),
    ),
  ]) as Promise<Return>;
}
