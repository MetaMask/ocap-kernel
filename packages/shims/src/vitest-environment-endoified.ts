import type { Context } from 'node:vm';
import type { Environment } from 'vitest/environments';

export default {
  name: 'endoified',
  transformMode: 'ssr',
  async setupVM() {
    const vm = await import('node:vm');
    return {
      getVmContext(): Context {
        return vm.createContext({
          setTimeout,
          clearTimeout,
        });
      },
      teardown(): void {
        return undefined;
      },
    };
  },
  async setup() {
    throw new Error(
      'endoified environment requires vitest option --pool=vmThreads or --pool=vmForks',
    );
  },
} as Environment;
