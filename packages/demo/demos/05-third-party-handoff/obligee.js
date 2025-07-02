import { E, Far } from '@endo/far';

export function buildRootObject(_, { name = 'Alice' }) {
  return Far('root', {
    getName: () => name,

    async run(service, connection) {
      // Make the request, oblivious to the underlying details of delegation.
      const counter = await E(service).foo();
      console.log(`${name}: E(counter).inc() = ${await E(counter).inc()}`);
      console.log(`${name}: E(counter).inc() = ${await E(counter).inc()}`);

      // Break the connection over which the request was made.
      await E(connection).unlink();

      // Upon retry, the connection is broken; ergo no can haz new counter.
      await E(service)
        .foo()
        .catch((error) => console.error(`${name}: ${error.message}`));

      // But the counter handed off prior will continue working.
      console.log(`${name}: E(counter).inc() = ${await E(counter).inc()}`);
      console.log(`${name}: E(counter).inc() = ${await E(counter).inc()}`);
    },
  });
}
