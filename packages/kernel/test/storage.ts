import type { KernelStore } from '../src/kernel-store.js';

/**
 * A mock kernel store realized as a Map<string, string>.
 *
 * @returns The mock {@link KernelStore}.
 */
export function makeMapKernelStore(): KernelStore {
  const map = new Map<string, string>();
  return {
    kvGet: (key) => {
      const value = map.get(key);
      if (value === undefined) {
        throw new Error(`No value found for key ${key}.`);
      }
      return value;
    },
    kvSet: map.set.bind(map),
  };
}
