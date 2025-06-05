export default function makeRandom(seed = 0) {
  let state = typeof seed === 'number' ? seed : 0;

  // A linear congruential generator suffices for our purposes.
  const tick = () => (state = (state * 1664525 + 1013904223) % 4294967296);

  return {
    /**
     * Select a random element from an array, chosen with uniform probability.
     *
     * @param {Array} options - The array of options to choose from.
     * @returns {unknown} A random element from the array.
     */
    choice: (options) => options[tick() % options.length],
  };
}
