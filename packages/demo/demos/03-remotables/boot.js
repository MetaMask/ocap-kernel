import { E, Far } from '@endo/far';

export function buildRootObject(_, { moduli = [1], countTo = 10 }) {
  // To create a remotable, use `Far`.
  return Far('root', {
    async bootstrap({ counter, buzzer }) {
      const makeBuzzer = (modulus) =>
        E(buzzer).make(
          // To call a remotable method, use `E`.
          modulus,
          counter, // To pass a remotable, use neither E nor Far.
          `${modulus} divides {}`,
        );

      const buzzers = await Promise.all(moduli.map(makeBuzzer));

      while ((await E(counter).inc()) < countTo) {
        await Promise.all(buzzers.map((bzzt) => E(bzzt).poll()));
      }
    },
  });
}
