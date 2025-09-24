import type { MeterControl } from '@agoric/swingset-liveslots';
import { assert } from '@endo/errors';

/**
 * Liveslots must be given a MeterControl object so it can turn metering on and
 * off in metered execution environments. We have no metering, so this produces
 * an object that obeys the MeterControl API but doesn't actually do anything.
 *
 * @returns a dummy MeterControl object.
 */
export function makeDummyMeterControl(): MeterControl {
  /** Depth of metering disablement */
  let meteringDisabled = 0;

  /**
   * Test if metering is disabled.
   *
   * @returns true iff metering is currently off.
   */
  function isMeteringDisabled(): boolean {
    return meteringDisabled > 0;
  }

  /**
   * Require metering to be on.
   *
   * @param message - Error message to throw if metering is off.
   */
  function assertIsMetered(message: string): void {
    assert(meteringDisabled === 0, message);
  }

  /**
   * Require metering to be off.
   *
   * @param message - Error message to throw if metering is on.
   */
  function assertNotMetered(message: string): void {
    assert(meteringDisabled > 0, message);
  }

  /**
   * Execute a thunk with metering off.
   *
   * @param thunk - The thunk to execute.
   * @returns whatever `thunk` returns.
   */
  function runWithoutMetering(thunk: () => unknown): unknown {
    meteringDisabled += 1;
    try {
      return thunk();
    } finally {
      meteringDisabled -= 1;
    }
  }

  /**
   * Execute an aynchronous thunk with metering off.
   *
   * @param thunk - The thunk to execute.
   * @returns a promise for whatever `thunk` returns.
   */
  async function runWithoutMeteringAsync(
    thunk: () => unknown,
  ): Promise<unknown> {
    meteringDisabled += 1;
    return Promise.resolve()
      .then(() => thunk())
      .finally(() => {
        meteringDisabled -= 1;
      });
  }

  /**
   * Return a version of func that runs outside metering.  Since we have no
   * metering, everything actually runs outside metering, so func itself would
   * do, but we need to wrap it anyway to account for the nesting depth of
   * metering disablement.
   *
   * @param func - The function to wrap.
   * @returns A version of `func` that runs without being metered.
   */
  function unmetered(
    func: (...args: unknown[]) => unknown,
  ): (...args: unknown[]) => unknown {
    /**
     * A version of `func` with `runWithoutMetering` wrapped around it.
     *
     * @param args - The args to `func`.
     * @returns whatever `func` returns.
     */
    function wrapped(...args: unknown[]): unknown {
      return runWithoutMetering(() => func(...args));
    }
    return harden(wrapped);
  }

  const meterControl = {
    isMeteringDisabled,
    assertIsMetered,
    assertNotMetered,
    runWithoutMetering,
    runWithoutMeteringAsync,
    unmetered,
  };
  return harden(meterControl);
}
