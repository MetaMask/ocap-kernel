import { Far } from '@endo/marshal';
import { makePipe } from '@endo/stream';
import { makeLogger } from '../../../../dist/demo/logger.mjs';

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
  const { setInterval, clearInterval } = vatPowers;

  const logger = makeLogger({ label: 'asyncGen', verbose });

  let counterIdCount = 0;
  const counters = new Map();

  const makeCounter = (start = 0, ms = 100) => {
    const [reader, writer] = makePipe();
    let count = start;
  
    const interval = setInterval(async () => {
      const thisCount = count;
      count += 1;
      await writer.next(thisCount);
    }, ms);

    const stop = async () => {
      clearInterval(interval);
      await Promise.resolve(() => undefined);
    };

    const id = counterIdCount;
    const counter = { reader, stop };
    counterIdCount += 1;
    counters.set(id, counter);

    return { id, counter };
  }

  const getCounter = (id) => {
    const counter = counters.get(id);
    if (!counter) {
      throw new Error(`No such counterId ${id}`, { cause: id });
    }
    return counter;
  }

  return Far('root', {
    async ping() {
      return 'ping';
    },
    async next(counterId) {
      return await getCounter(counterId).reader.next();
    },
    async throw(counterId, error) {
      return await getCounter(counterId).reader.throw(error);
    },
    async return(counterId, value) {
      return await getCounter(counterId).reader.return(value);
    },
    async stop(counterId) {
      verbose && logger.debug(`stopping [${counterId}]`);
      await getCounter(counterId).stop();
      return true;
    },
    makeCounter: (start, ms) => {
      const { id } = makeCounter(start, ms);
      return id;
    },
  });
}
