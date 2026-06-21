/**
 * In-process state for the demo plugin. The wallet balance is the
 * only thing that lives here now — artifact storage moved to the
 * process-global `artifact-store.ts` so the `@openclaw/discovery`
 * plugin's `service_call` interning and this plugin's bookkeeping
 * tools see the same Map.
 */

export type PluginState = {
  /** Configured starting balance; never reassigned. */
  readonly initialBalanceUsd: number;
  /** Current wallet balance. */
  balanceUsd: number;
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
  };
}
