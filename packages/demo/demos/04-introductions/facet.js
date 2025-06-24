import { E, Far } from '@endo/far';

/**
 * Produce a remotable object from a subset of the methods of another object.
 *
 * @param {object} obj - The object to produce a facet from.
 * @param {string[]} props - The properties to include in the facet.
 * @returns {object} The facet object.
 */
export const makeFacet = (obj, props) =>
  Far(
    `facet`,
    Object.fromEntries(
      props.map((prop) => [prop, (...args) => E(obj)[prop](...args)]),
    ),
  );
