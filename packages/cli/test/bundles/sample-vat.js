/**
 * Start function for generic test vat.
 *
 * @param {unknown} parameters - Initialization parameters from the vat's config object.
 * @returns {unknown} The root object for the new vat.
 */
export function start(parameters) {
  const name = parameters?.name ?? 'anonymous';
  console.log(`start vat root object "${name}"`);
  return {
    name,
    stuff: `initialized with ${JSON.stringify(parameters)}`,
  };
}
