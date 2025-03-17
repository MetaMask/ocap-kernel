import { Far } from '@endo/marshal';

import { makeLogger } from '../../../../dist/demo/logger.mjs';
import { makeStreamMaker } from '../../../../dist/demo/stream.mjs';

/**
 * Build function for the vector store vat.
 *
 * @param {unknown} vatPowers - Special powers granted to this vat (not used here).
 * @param {unknown} vatPowers.setInterval - A setInterval power.
 * @param {unknown} vatPowers.clearInterval - A clearInterval power.
 * @param {unknown} parameters - Initialization parameters from the vat's config object.
 * @param {unknown} _baggage - Root of vat's persistent state (not used here).
 * @returns {unknown} The root object for the new vat.
 */
export function buildRootObject(vatPowers, parameters, _baggage) {
  const { verbose } = parameters;
  // eslint-disable-next-line no-shadow
  const { setInterval, clearInterval } = vatPowers;

  const logger = makeLogger({ label: 'asyncGen', verbose });

  const counters = new Map();

  const { readStreamFacet, makeStream } = makeStreamMaker();

  const makeCounter = (start = 0, ms = 100) => {
    const { id, writer } = makeStream();
    let count = start;

    const interval = setInterval(async () => {
      const thisCount = count;
      count += 1;
      await writer.next(thisCount);
    }, ms);

    const stop = async () => {
      clearInterval(interval);
      await Promise.resolve(() => undefined);
      counters.delete(id);
    };

    counters.set(id, { stop });
    return id;
  };

  const getCounter = (id) => {
    const counter = counters.get(id);
    if (!counter) {
      throw new Error(`No such counterId ${id}`, { cause: id });
    }
    return counter;
  };

  return Far('root', {
    async ping() {
      return 'ping';
    },
    ...readStreamFacet,
    makeCounter,
    async stop(counterId) {
      verbose && logger.debug(`stopping [${counterId}]`);
      await getCounter(counterId).stop();
      return true;
    },
  });
}
