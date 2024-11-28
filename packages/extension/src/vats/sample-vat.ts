import type { UserCodeExports } from '@ocap/kernel';

/**
 * Start function for generic test vat.
 *
 * @param parameters - Initialization parameters from the vat's config object.
 * @param parameters.name - The name of the vat.
 * @returns The root object for the new vat.
 */
export async function start(parameters: {
  name?: string;
}): Promise<UserCodeExports> {
  const name = parameters?.name ?? 'anonymous';
  console.log(`start vat root object "${name}"`);
  return {
    name,
    methods: {
      whatIsTheGreatFrangooly: () => 'Crowned with Chaos',
    },
    properties: {
      stuff: `initialized with ${JSON.stringify(parameters)}`,
    },
  };
}
