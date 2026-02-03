import { E } from '@endo/eventual-send';
import { makeDefaultExo } from '@metamask/kernel-utils/exo';
import type { VatPowers } from '@metamask/ocap-kernel';

/**
 * Build function for running a test of kernel service objects.
 *
 * @param vatPowers - Special powers granted to this vat.
 * @param vatPowers.logger - The logger for the vat.
 * @param parameters - Initialization parameters from the vat's config object.
 * @param parameters.name - The name of the vat.
 * @returns The root object for the new vat.
 */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function buildRootObject(
  vatPowers: VatPowers,
  parameters: { name?: string } = {},
) {
  const name = parameters?.name ?? 'anonymous';
  const logger = vatPowers.logger.subLogger({ tags: ['test', name] });
  const tlog = (...args: unknown[]): void => logger.log(...args);
  // eslint-disable-next-line no-console
  console.log(`buildRootObject "${name}"`);

  const thing = makeDefaultExo('thing', {});
  let testService: unknown;
  tlog(`buildRootObject "${name}"`);

  const mainVatRoot = makeDefaultExo('root', {
    async bootstrap(_vats: unknown, services: { testService: unknown }) {
      tlog(`vat ${name} is bootstrap`);
      testService = services.testService;
    },
    async go() {
      const serviceResult = await E(testService).getStuff(thing, 'hello');
      tlog(`kernel service returns ${serviceResult}`);
      await E(mainVatRoot).loopback();
    },
    async goBadly() {
      try {
        const serviceResult = await E(testService).nonexistentMethod(
          thing,
          'hello',
        );
        tlog(`kernel service returns ${serviceResult} and it shouldn't have`);
      } catch (problem) {
        tlog(`kernel service threw: ${(problem as Error).message}`);
      }
      await E(mainVatRoot).loopback();
    },
    loopback() {
      return undefined;
    },
  });
  return mainVatRoot;
}
