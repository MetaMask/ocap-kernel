import { Fail } from '@endo/errors';
import { E, Far } from '@endo/far';

export function buildRootObject(_, { name }) {
  let delegatee;
  let offline = false;

  return Far('root', {
    introduce: (introduced) => (delegatee = introduced),

    // To hand off the request, just return a promise from the delegatee.
    foo: () => (offline ? Fail`${name} is offline` : E(delegatee).foo()),

    // Simulate this vat becoming unavailable.
    terminate: () => {
      offline = true;
      console.log(`${name} will not be back`);
    },
  });
}
