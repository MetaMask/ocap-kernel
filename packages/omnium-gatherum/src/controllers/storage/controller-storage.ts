import type { Json } from '@metamask/utils';
import { enablePatches, produce } from 'immer';
import type { Patch } from 'immer';

import type { StorageAdapter } from './types.ts';

// Enable immer patches globally (called once at module load)
enablePatches();

// TODO: Add migration utility for converting from per-key storage format
// (e.g., caplet.{id}.manifest) to consolidated state format (caplet.manifests)
// when there is deployed data to migrate.

/**
 * Configuration for creating a ControllerStorage instance.
 */
export type ControllerStorageConfig<State extends Record<string, Json>> = {
  /** The namespace prefix for storage keys (e.g., 'caplet') */
  namespace: string;
  /** The underlying storage adapter */
  adapter: StorageAdapter;
  /** Default state values - used for initialization and type inference */
  defaultState: State;
};

/**
 * ControllerStorage provides a simplified state management interface for controllers.
 *
 * Features:
 * - Flat top-level key mapping: `state.foo` maps to `{namespace}.foo` in storage
 * - Immer-based updates with automatic change detection
 * - Only modified top-level keys are persisted
 * - Eager loading on initialization
 *
 * @template State - The state object type (must have Json-serializable values)
 */
export type ControllerStorage<State extends Record<string, Json>> = {
  /**
   * Current state (readonly, hardened).
   * Access individual properties: `storage.state.installed`
   */
  readonly state: Readonly<State>;

  /**
   * Update state using an immer producer function.
   * Only modified top-level keys will be persisted to storage.
   *
   * @param producer - Function that mutates a draft of the state
   * @returns Promise that resolves when changes are persisted
   * @throws If storage persistence fails (state remains unchanged)
   *
   * @example
   * ```typescript
   * await storage.update(draft => {
   *   draft.installed.push('com.example.app');
   *   draft.manifests['com.example.app'] = manifest;
   * });
   * ```
   */
  update: (producer: (draft: State) => void) => Promise<void>;

  /**
   * Force reload state from storage.
   * Useful for syncing after external storage changes.
   */
  reload: () => Promise<void>;
};

/**
 * Create a ControllerStorage instance for a controller.
 *
 * This factory function:
 * 1. Loads existing state from storage for the namespace
 * 2. Merges with defaults (storage values take precedence)
 * 3. Returns a hardened ControllerStorage interface
 *
 * @param config - Configuration including namespace, adapter, and default state.
 * @returns Promise resolving to a hardened ControllerStorage instance.
 *
 * @example
 * ```typescript
 * const capletState = await makeControllerStorage({
 *   namespace: 'caplet',
 *   adapter: storageAdapter,
 *   defaultState: { installed: [], manifests: {} }
 * });
 *
 * // Read state
 * console.log(capletState.state.installed);
 *
 * // Update state
 * await capletState.update(draft => {
 *   draft.installed.push('com.example.app');
 * });
 * ```
 */
export async function makeControllerStorage<State extends Record<string, Json>>(
  config: ControllerStorageConfig<State>,
): Promise<ControllerStorage<State>> {
  const { namespace, adapter, defaultState } = config;
  const prefix = `${namespace}.`;

  /**
   * Build a storage key from a state property name.
   *
   * @param stateKey - The state property name.
   * @returns The namespaced storage key.
   */
  const buildKey = (stateKey: string): string => `${prefix}${stateKey}`;

  /**
   * Strip namespace prefix from a storage key.
   *
   * @param fullKey - The full namespaced storage key.
   * @returns The state property name without prefix.
   */
  const stripPrefix = (fullKey: string): string => fullKey.slice(prefix.length);

  /**
   * Load all state from storage, merging with defaults.
   * Storage values take precedence over defaults.
   *
   * @returns The merged state object.
   */
  const loadState = async (): Promise<State> => {
    const allKeys = await adapter.keys(prefix);

    // Start with a copy of defaults
    const state = { ...defaultState };

    // Load and merge values from storage
    await Promise.all(
      allKeys.map(async (fullKey) => {
        const key = stripPrefix(fullKey) as keyof State;
        const value = await adapter.get<Json>(fullKey);
        if (value !== undefined) {
          state[key] = value as State[keyof State];
        }
      }),
    );

    return produce({}, (draft) => {
      Object.assign(draft, state);
    }) as State;
  };

  /**
   * Persist specific keys to storage.
   *
   * @param stateToSave - The state object containing values to persist.
   * @param keys - Set of top-level keys to persist.
   */
  const persistKeys = async (
    stateToSave: State,
    keys: Set<string>,
  ): Promise<void> => {
    await Promise.all(
      Array.from(keys).map(async (key) => {
        const storageKey = buildKey(key);
        const value = stateToSave[key as keyof State];
        await adapter.set(storageKey, value as Json);
      }),
    );
  };

  /**
   * Extract top-level keys that were modified from immer patches.
   *
   * @param patches - Array of immer patches describing changes.
   * @returns Set of modified top-level keys.
   */
  const getModifiedKeys = (patches: Patch[]): Set<string> => {
    const keys = new Set<string>();
    for (const patch of patches) {
      // The first element of path is always the top-level key
      if (patch.path.length > 0) {
        keys.add(String(patch.path[0]));
      }
    }
    return keys;
  };

  // Load initial state
  let currentState = await loadState();

  const storage: ControllerStorage<State> = {
    get state(): Readonly<State> {
      return currentState;
    },

    async update(producer: (draft: State) => void): Promise<void> {
      // Capture state before async operations to avoid race conditions
      const stateSnapshot = currentState;

      // Use immer's produce with patches callback to track changes
      let patches: Patch[] = [];
      const nextState = produce(stateSnapshot, producer, (patchList) => {
        patches = patchList;
      });

      // No changes - nothing to do
      if (patches.length === 0) {
        return;
      }

      // Determine which top-level keys changed
      const modifiedKeys = getModifiedKeys(patches);

      // Persist only the modified keys
      await persistKeys(nextState, modifiedKeys);

      // Update in-memory state only after successful persistence
      // eslint-disable-next-line require-atomic-updates -- Last-write-wins is intentional
      currentState = nextState;
    },

    async reload(): Promise<void> {
      currentState = await loadState();
    },
  };

  return harden(storage);
}
harden(makeControllerStorage);
