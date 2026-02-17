/**
 * Create a mock baggage store for testing.
 *
 * @returns A mock baggage with Map semantics and an `init` method.
 */
export function makeMockBaggage(): Map<string, unknown> & {
  init: (key: string, value: unknown) => void;
} {
  const store = new Map<string, unknown>();
  return Object.assign(store, {
    init(key: string, value: unknown) {
      if (store.has(key)) {
        throw new Error(`Key already exists: ${key}`);
      }
      store.set(key, value);
    },
  });
}
