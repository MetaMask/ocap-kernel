import { Fail } from '@endo/errors';
import { E, Far } from '@endo/far';

const services = {
  pow: (base, exponent) => Number(base) ** Number(exponent),
  mod: (dividend, divisor) => Number(dividend) % Number(divisor),
  sub: (minuend, subtrahend) => Number(minuend) - Number(subtrahend),
};

export function buildRootObject(_, { prices = {} }) {
  const serviceDescriptors = Object.entries(prices).map(([name, price]) => ({
    name,
    price,
    impl: services[name] ?? Fail`Config error: Service ${name} not found`,
  }));

  return Far('root', {
    getServiceDescriptor: () => ({
      provided: serviceDescriptors.map(({ name, price }) => ({ name, price })),
      services: Far(
        'implementations',
        Object.fromEntries(
          serviceDescriptors.map(({ name, impl, price }) => [
            name,
            async (payable, args) => {
              console.log(`providing service ${name} with price ${price}`);
              return E(payable)
                .request(price)
                .then(() => impl(...args));
            },
          ]),
        ),
      ),
    }),
  });
}
