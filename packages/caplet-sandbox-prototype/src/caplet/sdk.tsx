import { useCallback, useEffect, useMemo, useState } from 'preact/hooks';

import { getBridge } from './caplet-bridge.ts';

/**
 * Creates a typed backend proxy for calling methods.
 *
 * @param methods - Object mapping method names to their implementations.
 * @returns Backend proxy object.
 */
export function createBackend<
  Backend extends Record<string, unknown>,
>(methods: {
  [K in keyof Backend]: (
    ...args: Parameters<Backend[K] & ((...args: unknown[]) => unknown)>
  ) => Promise<void>;
}): Backend {
  return methods as Backend;
}

/**
 * Hook that provides a proxy for calling backend methods.
 * The methods object should be created with createBackend().
 *
 * @param methodNames - Array of method names to expose.
 * @returns Backend proxy object with methods that call the host.
 */
export function useBackendMethods<Methods extends string[]>(
  methodNames: Methods,
): Record<Methods[number], (...args: unknown[]) => Promise<void>> {
  const bridge = getBridge();

  const backend = useMemo(() => {
    const methods: Record<string, (...args: unknown[]) => Promise<void>> = {};
    for (const method of methodNames) {
      methods[method] = async (...args: unknown[]) => {
        await bridge.callMethod(method, args);
      };
    }
    return methods;
  }, [bridge, ...methodNames]);

  return backend as Record<
    Methods[number],
    (...args: unknown[]) => Promise<void>
  >;
}

/**
 * Hook that subscribes to backend state and provides reactive updates.
 *
 * @param selector - Function to select a portion of the state.
 * @returns Selected state value.
 */
export function useBackendState<State, Selected>(
  selector: (state: State) => Selected,
): Selected | undefined {
  const bridge = getBridge<State>();

  const [selected, setSelected] = useState<Selected | undefined>(() => {
    const state = bridge.getState();
    return state ? selector(state) : undefined;
  });

  const memoizedSelector = useCallback(selector, []);

  useEffect(() => {
    const unsubscribe = bridge.subscribe((state) => {
      setSelected(memoizedSelector(state));
    });

    const currentState = bridge.getState();
    if (currentState) {
      setSelected(memoizedSelector(currentState));
    }

    return unsubscribe;
  }, [bridge, memoizedSelector]);

  return selected;
}

/**
 * Hook that provides the full backend state.
 *
 * @returns Full application state or undefined if not initialized.
 */
export function useFullState<State>(): State | undefined {
  return useBackendState<State, State>((state) => state);
}
