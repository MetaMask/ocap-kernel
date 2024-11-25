/**
 * Start function for generic test vat.
 *
 * @param {unknown} parameters - Initialization parameters from the vat's config object.
 * @returns {unknown} The root object for the new vat.
 */
export function start(parameters) {
  const name = parameters?.name ?? 'anonymous';
  console.log(`empece vat root objecto "${name}"`);
  return {
    name,
    stuff: `se inició por ${JSON.stringify(parameters)}`,
  };
}
