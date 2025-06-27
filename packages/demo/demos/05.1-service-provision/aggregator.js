import { E, Far } from '@endo/far';

export function buildRootObject() {
  const resolutions = new Map();
  const addResolution = (name, price, impl) =>
    resolutions.set(name, [...(resolutions.get(name) ?? []), { price, impl }]);

  /**
   * Return the service implementation with the lowest price.
   *
   * @param {string} name - The name of the service.
   * @returns {*} The implementation with the lowest price.
   */
  const getResolution = (name) =>
    // TODO: If name is not found, this will grind up the crank.
    (resolutions.get(name) ?? []).reduce(
      (acc, { price, impl }) => (price < acc.price ? { price, impl } : acc),
      { price: Infinity, impl: null },
    ).impl ?? new Error(`Service ${name} not found`);

  return Far('root', {
    async introduceProvider(serviceDescriptor) {
      // We can't update vat state until the service descriptor arrives.
      const descriptor = await serviceDescriptor;
      for (const { name, price } of descriptor.provided) {
        addResolution(name, price, descriptor.services);
      }
    },
    requestService: (serviceName) => {
      const resolution = getResolution(serviceName);
      return Error.isError(resolution)
        ? resolution
        : Far(serviceName, {
            request: (...args) => E(resolution)[serviceName](...args),
          });
    },
  });
}
