/* eslint-disable @typescript-eslint/explicit-function-return-type */
import endoified from '@ocap/test-utils/endoified';
import { describe } from 'vitest';
import * as vitest from 'vitest';

/* eslint-disable vitest/valid-describe-callback */
describe(
  `endoify`,
  endoified(
    // eslint-disable-next-line @typescript-eslint/no-shadow
    ({ it, expect }) => {
      for (const assertion of [
        () => typeof globalThis === 'object',
        () => typeof lockdown === 'function',
        () => typeof repairIntrinsics === 'function',
        () => typeof Compartment === 'function',
        () => typeof assert === 'function',
        () => typeof HandledPromise === 'function',
        () => typeof harden === 'function',
        () => typeof getStackString === 'function',
        () => {
          try {
            return !Object.assign(harden({ a: 1 }), { b: 2 });
          } catch {
            return true;
          }
        },
      ]) {
        it(`asserts ${String(assertion)}`, () => {
          console.log(`${String(assertion)} => ${assertion()}`);
          expect(assertion(), `${String(assertion)}`).toBe(true);
        });
      }
    },
    { ...vitest },
  ),
);

declare global {
  // eslint-disable-next-line no-var
  var getStackString: (error: Error) => string;
  // eslint-disable-next-line no-var, @typescript-eslint/consistent-type-imports
  var HandledPromise: import('@endo/eventual-send').HandledPromiseConstructor;
}
