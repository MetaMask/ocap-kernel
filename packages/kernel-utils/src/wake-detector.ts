/**
 * Options for configuring the wake detector.
 */
export type WakeDetectorOptions = {
  /**
   * How often to check for clock jumps (in milliseconds).
   *
   * @default 15000 (15 seconds)
   */
  intervalMs?: number | undefined;

  /**
   * Minimum clock jump to consider a wake event (in milliseconds).
   *
   * @default 30000 (30 seconds)
   */
  jumpThreshold?: number | undefined;
};

/**
 * Install a cross-environment sleep/wake detector that uses clock jump detection.
 * Useful for detecting when a machine wakes from sleep in both browser and Node.js.
 *
 * The detector works by checking if the system clock has jumped forward significantly
 * between interval checks. If the jump exceeds the threshold, it indicates the process
 * was suspended (e.g., machine sleep) and has now resumed.
 *
 * @param onWake - Callback to invoke when a wake event is detected.
 * @param options - Configuration options for the detector.
 * @returns A cleanup function to stop the detector.
 *
 * @example
 * ```typescript
 * const cleanup = installWakeDetector(() => {
 *   console.log('System woke from sleep, resetting connections...');
 *   resetBackoffCounters();
 * });
 *
 * // Later, when shutting down:
 * cleanup();
 * ```
 */
export function installWakeDetector(
  onWake: () => void,
  options: WakeDetectorOptions = {},
): () => void {
  const intervalMs = options.intervalMs ?? 15_000; // 15 seconds
  const jumpThreshold = options.jumpThreshold ?? 30_000; // 30 seconds

  let last = Date.now();

  const intervalId = setInterval(() => {
    const now = Date.now();
    if (now - last > intervalMs + jumpThreshold) {
      // Clock jumped forward significantly - probable wake from sleep
      onWake();
    }
    last = now;
  }, intervalMs);

  // Return cleanup function
  return () => {
    clearInterval(intervalId);
  };
}
