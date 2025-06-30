import { E, Far } from '@endo/far';

export function buildRootObject(_, { name }) {
  let service;

  return Far('root', {
    async introduceService(introduced) {
      console.log(`${name} introducing service`);
      service = introduced;
      console.log(`${name} introduced service`);
      return undefined;
    },

    async run() {
      console.log(`${name} requesting service...`);
      const response = E(service).request();
      console.log(`${name} waiting for response...`);
      const result = await response;
      console.log(`${name} received response:`, result);
      return result;
    },
  });
}
