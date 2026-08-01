/**
 * Plugin state management for the MetaMask capability vendor plugin.
 *
 * Tracks the vendor ref (obtained by redeeming the OCAP URL) and a
 * map of named capabilities obtained from the vendor.
 */
import type { DaemonCaller } from './daemon.ts';

/**
 * Schema describing a single method on a capability.
 * Mirrors `MethodSchema` from `@metamask/kernel-utils`.
 */
export type MethodSchema = {
  description: string;
  args: Record<string, { type: string; description?: string }>;
  returns?: { type: string; description?: string };
};

export type CapEntry = {
  ref: string;
  name: string;
  description: string;
  methods: Record<string, MethodSchema> | undefined;
};

export type PluginState = {
  ocapUrl: string;
  vendorRef: string | undefined;
  capabilities: Map<string, CapEntry>;
};

/**
 * Create a fresh plugin state.
 *
 * @param ocapUrl - Initial OCAP URL from config/env (may be empty).
 * @returns A new plugin state.
 */
export function createState(ocapUrl = ''): PluginState {
  return {
    ocapUrl,
    vendorRef: undefined,
    capabilities: new Map(),
  };
}

const REF_PATTERN = /^@@[A-Za-z0-9]+$/u;

/**
 * Check if a string looks like an ocap-jsonrpc-vat ref (e.g. `@@j5`).
 *
 * @param value - The string to check.
 * @returns True if it matches the ref pattern.
 */
export function isRef(value: string): boolean {
  return REF_PATTERN.test(value);
}

/**
 * Default capability name for a ref we've received without any better
 * label — the ref minus the `@@` sigil, prefixed with `cap:`.
 *
 * @param ref - The ref string.
 * @returns A base nickname string.
 */
export function baseNicknameFor(ref: string): string {
  return ref.replace(/^@@/u, 'cap:');
}

/**
 * Ensure the vendor ref is available, redeeming the OCAP URL if needed.
 *
 * @param options - Options.
 * @param options.state - The plugin state.
 * @param options.daemon - The daemon caller.
 * @returns The vendor ref.
 */
export async function ensureVendor(options: {
  state: PluginState;
  daemon: DaemonCaller;
}): Promise<string> {
  const { state, daemon } = options;

  if (state.vendorRef) {
    return state.vendorRef;
  }

  if (!state.ocapUrl) {
    throw new Error(
      'Not connected to a MetaMask wallet. Ask the user for their OCAP URL ' +
        'from their ocap kernel-enabled MetaMask extension and pass it to ' +
        'metamask_obtain_vendor.',
    );
  }

  const ref = await daemon.redeemUrl(state.ocapUrl);
  state.vendorRef = ref;
  return ref;
}

/**
 * Resolve a capability reference to a ref.
 * Accepts either a capability name (looked up in state) or a direct
 * ocap-jsonrpc-vat ref string.
 *
 * @param nameOrRef - Capability name or ref string.
 * @param state - The plugin state.
 * @returns The resolved ref.
 */
export function resolveCapability(
  nameOrRef: string,
  state: PluginState,
): string {
  if (isRef(nameOrRef)) {
    return nameOrRef;
  }

  const entry = state.capabilities.get(nameOrRef);
  if (!entry) {
    const available = [...state.capabilities.keys()];
    const hint =
      available.length > 0
        ? ` Available: ${available.join(', ')}`
        : ' No capabilities obtained yet. Use metamask_request_capability first.';
    throw new Error(`Unknown capability "${nameOrRef}".${hint}`);
  }
  return entry.ref;
}
