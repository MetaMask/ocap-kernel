console.log('build throw');

/**
 * Build function for vats that will throw an error during buildRootObject.
 *
 * @returns {never} Always throws an error.
 */
export function buildRootObject() {
  console.log('buildRootObject');
  throw new Error('from buildRootObject');
}
