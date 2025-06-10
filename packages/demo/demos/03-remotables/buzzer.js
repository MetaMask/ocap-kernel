import { E, Far } from '@endo/far';

/**
 * Construct a new buzzer that reads the counter's shared state.
 *
 * @param {number} modulus - How often to buzz.
 * @param {{ get: () => number }} counter - A remotable which can get a number.
 * @param {string} message - What message to buzz with.
 * @returns {*} A remotable that buzzes on poll if `counter ≡ 0 (mod modulus)`.
 */
const make = (modulus, counter, message) =>
  // Remotable methods can make and return more remotables.
  Far(`buzz<${modulus}>`, {
    async poll() {
      const count = await E(counter).get();
      if (count % modulus === 0) {
        console.log(message.replace('{}', count));
      }
    },
  });

export function buildRootObject() {
  return Far('root', { make });
}
