import type { ClusterConfig } from '@ocap/kernel';

const makeBundleSpec = (name: string) => `http://localhost:3000/${name}.bundle`;

export const makeSubclusterConfig = (verbose: boolean): ClusterConfig => ({
  bootstrap: 'boot',
  vats: {
    boot: {
      bundleSpec: makeBundleSpec('boot'),
      parameters: { verbose },
    },
    asyncGenerator: {
      bundleSpec: makeBundleSpec('asyncGenerator'),
      parameters: { verbose },
    },
  },
});
