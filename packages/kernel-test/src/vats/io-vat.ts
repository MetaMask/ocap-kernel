import { E } from '@endo/eventual-send';
import { makeDefaultExo } from '@metamask/kernel-utils/exo';

import { unwrapTestLogger } from '../test-powers.ts';
import type { TestPowers } from '../test-powers.ts';

/**
 * Build function for testing IO kernel services.
 *
 * @param vatPowers - Special powers granted to this vat.
 * @param parameters - Initialization parameters from the vat's config object.
 * @param parameters.name - The name of the vat.
 * @returns The root object for the new vat.
 */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function buildRootObject(
  vatPowers: TestPowers,
  parameters: { name?: string } = {},
) {
  const name = parameters?.name ?? 'io-vat';
  const tlog = unwrapTestLogger(vatPowers, name);
  let ioService: unknown;

  return makeDefaultExo('root', {
    async bootstrap(_vats: unknown, services: { repl: unknown }) {
      tlog('bootstrap');
      ioService = services.repl;
    },
    async doRead() {
      const line = await E(ioService).read();
      tlog(`read: ${line}`);
      return line;
    },
    async doWrite(data: string) {
      await E(ioService).write(data);
      tlog(`wrote: ${data}`);
    },
  });
}
