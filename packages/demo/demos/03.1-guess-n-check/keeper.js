/**
 * Example 03: Remotables.
 * -----------------------
 * This example shows how to create and export a remotable object.
 *
 * @see guesser.js for the vat that uses the remotable object.
 * @see cluster.json for the keeper vat's initial value.
 *
 * This vat has a write-only value property, set by the setValue method.
 * The vat also has a momento method, which returns a remotable 'momento'
 *   object that can be used to check if the keeper vat's value has changed
 *   since the momento was created.
 *
 * The guesser vat can use the momento object to check if the keeper vat's
 *   value has changed since the momento was created.
 */
import { Fail } from '@endo/errors';
import { Far } from '@endo/far';

export function buildRootObject(_, { initialValue }) {
  let value = initialValue ?? Fail('initialValue is required');

  return Far('root', {
    momento: () => {
      const saved = value;
      // The code in the 'matches' method does not leave this vat. The object
      // on the far side of the vat boundary is a proxy with the capability to
      // run code in this vat. The result will be returned to the far side, but
      // the intermediate means of calculation are safely confined here.
      return Far('momento', { matches: () => saved === value });
    },
    setValue: (newValue) => (value = newValue),
  });
}
