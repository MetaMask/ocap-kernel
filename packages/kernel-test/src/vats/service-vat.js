import { E } from '@endo/eventual-send';
import { Far } from '@endo/marshal';

/**
 * Build function for running a test of kernel service objects.
 *
 * @param {unknown} vatPowers - Special powers granted to this vat.
 * @param {unknown} parameters - Initialization parameters from the vat's config object.
 * @returns {unknown} The root object for the new vat.
 */
export function buildRootObject(vatPowers, parameters) {
  const name = parameters?.name ?? 'anonymous';
  const logger = vatPowers.logger.subLogger({ tags: ['test', name] });
  const tlog = (...args) => logger.log(...args);
  console.log(`buildRootObject "${name}"`);

  const thing = Far('thing', {});
  let testService;

  const mainVatRoot = Far('root', {
    async bootstrap(_vats, services) {
      console.log(`vat ${name} is bootstrap`);
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
        tlog(`kernel service threw: ${problem.message}`);
      }
      await E(mainVatRoot).loopback();
    },
    loopback() {
      return undefined;
    },
  });
  return mainVatRoot;
}
