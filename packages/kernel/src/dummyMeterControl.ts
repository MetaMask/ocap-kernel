import { assert } from '@endo/errors';

/* eslint-disable jsdoc/require-jsdoc */

export function makeDummyMeterControl(): unknown {
  let meteringDisabled = 0;

  function isMeteringDisabled(): boolean {
    return Boolean(meteringDisabled);
  }

  function assertIsMetered(message: string): void {
    assert(!meteringDisabled, message);
  }

  function assertNotMetered(message: string): void {
    assert(Boolean(meteringDisabled), message);
  }

  function runWithoutMetering(thunk: () => unknown): unknown {
    meteringDisabled += 1;
    try {
      return thunk();
    } finally {
      meteringDisabled -= 1;
    }
  }

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

  // return a version of func that runs outside metering
  function unmetered(func: (...args: unknown[]) => unknown): unknown {
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
