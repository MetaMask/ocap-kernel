import { E, Far } from '@endo/far';

export function buildRootObject(_, { name }) {
  return Far('root', {
    getName: () => name,
    async run(service, terminator) {
      // Make the request, oblivious to the details of delegation.
      const result = E(service).foo();
      // Terminate the service between the time of request and response.
      await E(terminator).call();
      // Await the result of the request.
      console.log(`${name}: got ${await result}`);
    },
  });
}
