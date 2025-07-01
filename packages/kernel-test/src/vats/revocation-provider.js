import { Far } from '@endo/marshal';

/**
 * Build function for vats that will run various tests.
 *
 * @param {object} vatPowers - The vat powers.
 * @param {object} vatPowers.logger - The logger for this vat.
 * @returns {*} The root object for the new vat.
 */
export function buildRootObject({ logger }) {
  const { log } = logger.subLogger({ tags: ['test'] });
  const platform = { foo: () => `foo`, bar: () => `bar` };
  let revokerCount = 0;
  const revocable = (obj) => {
    const gate = Far('gate', { ...obj });
    // XXX makeRevoker is defined as an endowment (in VatSupervisor.ts), but
    // the linter has no way to know that it is defined.
    // eslint-disable-next-line no-undef
    const revoker = makeRevoker(gate);
    const id = revokerCount;
    revokerCount += 1;
    const slam = () => {
      revoker();
      log(`slam:${id}`);
    };
    return [gate, Far(`slam:${id}`, { slam })];
  };
  return Far('root', {
    requestPlatform: () => revocable(platform),
    revokerCount: () => revokerCount,
  });
}
