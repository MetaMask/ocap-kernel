import { E } from '@endo/eventual-send';
import { makeDefaultExo } from '@metamask/kernel-utils/exo';

/**
 * Build function for a vat that invokes a CapTP-registered kernel service.
 *
 * @param _vatPowers - Special powers granted to this vat (unused).
 * @param _parameters - Initialization parameters (unused).
 * @returns The root object for the new vat.
 */
export function buildRootObject(_vatPowers: unknown, _parameters: unknown) {
  let testService: unknown;

  return makeDefaultExo('root', {
    async bootstrap(_vats: unknown, services: { testService: unknown }) {
      testService = services.testService;
    },
    async go() {
      return E(testService).doSomething(3, 4);
    },
  });
}
