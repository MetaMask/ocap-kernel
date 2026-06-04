/**
 * In-process state for the demo plugin. All state is per-plugin-load:
 * a fresh openclaw process starts with no artifacts and the
 * configured initial wallet balance. Persisting across restarts is
 * future scope.
 */

export type ArtifactKind = 'svg' | 'image' | 'markdown' | 'json' | string;

export type StoredArtifact = {
  handle: string;
  artifactKind: ArtifactKind;
  data: string;
  fromService: string;
  metadata?: { title?: string; summary?: string };
};

export type PluginState = {
  /** Configured starting balance; never reassigned. */
  readonly initialBalanceUsd: number;
  /** Current wallet balance. */
  balanceUsd: number;
  /** Artifacts indexed by their opaque handle (e.g. "artifact-7"). */
  artifacts: Map<string, StoredArtifact>;
  /** Monotonic counter for the next artifact handle. */
  nextArtifactSeq: number;
};

/**
 * Build a fresh `PluginState`.
 *
 * @param options - Construction options.
 * @param options.initialBalanceUsd - Wallet starting balance.
 * @returns The empty state.
 */
export function createState(options: {
  initialBalanceUsd: number;
}): PluginState {
  return {
    initialBalanceUsd: options.initialBalanceUsd,
    balanceUsd: options.initialBalanceUsd,
    artifacts: new Map(),
    nextArtifactSeq: 0,
  };
}

/**
 * Allocate the next artifact handle. Handles are opaque strings of
 * the form `artifact-N`; the agent refers to artifacts by handle
 * rather than by data payload to keep its context manageable.
 *
 * @param state - The plugin state.
 * @returns A fresh handle.
 */
export function allocateArtifactHandle(state: PluginState): string {
  const handle = `artifact-${state.nextArtifactSeq}`;
  state.nextArtifactSeq += 1;
  return handle;
}
