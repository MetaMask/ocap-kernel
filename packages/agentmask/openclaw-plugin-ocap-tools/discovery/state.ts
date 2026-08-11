/**
 * Plugin state for the discovery plugin.
 *
 * Tracks three kinds of things the LLM agent accumulates over a session:
 *
 *   - the matcher's ocap URL + ref (once redeemed),
 *   - a map of contact endpoints the agent has redeemed (by URL → ref),
 *   - a map of service points the agent has obtained via `initiateContact`.
 *
 * The plugin also supports a "nickname" for contact endpoints and services
 * so the LLM can refer to them by name rather than by the raw sigil ref.
 *
 * Refs are the `@@j<n>` sigil strings the ocap-jsonrpc-vat assigns to
 * live kernel references. The field is kept simply as `ref` throughout
 * — its concrete syntax is a plugin-internal contract with the vat.
 */

import type { DaemonCaller } from '../daemon.ts';

export type MatcherEntry = {
  url: string;
  ref: string;
};

export type ContactEntry = {
  /**
   * The contact URL, if known. `undefined` for a contact passed via
   * another path (not used in Phase 3 but reserved).
   */
  url?: string;
  /** Ocap-jsonrpc-vat ref (`@@j<n>`) for the redeemed contact endpoint. */
  ref: string;
  /** Human-readable nickname the agent can use in place of the raw ref. */
  nickname: string;
};

export type ServiceEntry = {
  /** Ocap-jsonrpc-vat ref (`@@j<n>`) for the service endpoint. */
  ref: string;
  /** Nickname the LLM sees. */
  nickname: string;
  /** Nickname or URL of the contact endpoint this service was obtained from. */
  fromContact: string;
};

/**
 * 3-state representation of the matcher connection. Modeled as a
 * discriminated union so the type system rules out the contradictory
 * state where both a resolved entry and a still-pending pre-redemption
 * are observable at once. The `e359bf49b` fix ("await pre-redemption
 * before reporting no matcher") was exactly about racing on those two
 * fields, so the discriminator is load-bearing.
 */
export type MatcherSlot =
  | { status: 'absent' }
  | { status: 'pending'; promise: Promise<MatcherEntry> }
  | { status: 'resolved'; entry: MatcherEntry };

export type PluginState = {
  matcher: MatcherSlot;
  contacts: Map<string, ContactEntry>;
  services: Map<string, ServiceEntry>;
};

/**
 * Module-level singletons for the collections that need to survive
 * openclaw calling `register()` more than once (per subagent, per
 * session boundary, etc.). Without this, references handed back by a
 * paid `service_call` — including the auto-registered reviser
 * capabilities — vanish before the LLM's next turn, since
 * `state = createState()` produces a fresh empty map on each
 * re-registration.
 */
const persistentContacts = new Map<string, ContactEntry>();
const persistentServices = new Map<string, ServiceEntry>();

/**
 * Create a plugin state. Returns a state object whose `contacts` and
 * `services` maps are shared across all calls, so entries registered
 * on one turn are visible on the next.
 *
 * @returns The plugin state.
 */
export function createState(): PluginState {
  return {
    matcher: { status: 'absent' },
    contacts: persistentContacts,
    services: persistentServices,
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
 * Unique-ify a nickname by suffixing `-2`, `-3`, etc. if the base name is
 * already in use.
 *
 * @param base - The preferred nickname.
 * @param inUse - Set of nicknames already allocated.
 * @returns A nickname that is not in `inUse`.
 */
export function uniqueNickname(base: string, inUse: Set<string>): string {
  if (!inUse.has(base)) {
    return base;
  }
  let i = 2;
  while (inUse.has(`${base}-${i}`)) {
    i += 1;
  }
  return `${base}-${i}`;
}

/**
 * Default nickname for a ref we've received without any better
 * label — just the ref itself minus the `@@` sigil, so `@@j5` → `o5`.
 *
 * @param ref - The ref string.
 * @returns A base nickname string.
 */
export function baseNicknameFor(ref: string): string {
  return ref.replace(/^@@/u, 'ref:');
}

/**
 * Ensure a matcher has been redeemed; otherwise throw with instructions
 * for the agent. If a pre-configured matcher URL is mid-redemption, wait
 * for it to settle before deciding.
 *
 * @param state - The plugin state.
 * @returns The matcher ref.
 */
export async function requireMatcher(state: PluginState): Promise<string> {
  switch (state.matcher.status) {
    case 'resolved':
      return state.matcher.entry.ref;
    case 'pending':
      try {
        const entry = await state.matcher.promise;
        return entry.ref;
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        throw new Error(
          `Pre-configured matcher URL failed to redeem: ${detail}. ` +
            'Ask the user for a valid matcher OCAP URL and call ' +
            '`discovery_redeem_matcher`.',
        );
      }
    case 'absent':
      throw new Error(
        'No matcher connection. Ask the user for the matcher OCAP URL and ' +
          'call `discovery_redeem_matcher` first.',
      );
    default: {
      const exhaustiveCheck: never = state.matcher;
      throw new Error(`unreachable: ${JSON.stringify(exhaustiveCheck)}`);
    }
  }
}

/**
 * Resolve a contact reference (URL, ref, or nickname) to a contact
 * entry, redeeming the URL via the daemon if necessary.
 *
 * @param options - Resolution options.
 * @param options.ref - The reference to resolve. May be a URL, a
 * nickname, or an ocap-jsonrpc-vat ref (`@@j<n>`).
 * @param options.state - The plugin state.
 * @param options.daemon - The daemon caller.
 * @returns The resolved ContactEntry.
 */
export async function resolveContact(options: {
  ref: string;
  state: PluginState;
  daemon: DaemonCaller;
}): Promise<ContactEntry> {
  const { ref, state, daemon } = options;
  // If ref is a known contact nickname or URL, use the cached entry.
  const existing =
    state.contacts.get(ref) ??
    [...state.contacts.values()].find((entry) => entry.url === ref);
  if (existing) {
    return existing;
  }
  // If ref is a known service nickname or ref, reuse its ref.
  const serviceEntry =
    state.services.get(ref) ??
    [...state.services.values()].find((entry) => entry.ref === ref);
  if (serviceEntry) {
    const nickname = uniqueNickname(
      serviceEntry.nickname,
      new Set(state.contacts.keys()),
    );
    const entry: ContactEntry = { ref: serviceEntry.ref, nickname };
    state.contacts.set(nickname, entry);
    return entry;
  }
  // If it's already a bare ref, wrap it so subsequent calls work.
  if (isRef(ref)) {
    const nickname = uniqueNickname(
      baseNicknameFor(ref),
      new Set(state.contacts.keys()),
    );
    const entry: ContactEntry = { ref, nickname };
    state.contacts.set(nickname, entry);
    return entry;
  }
  // Otherwise treat ref as an OCAP URL to redeem.
  const redeemed = await daemon.redeemUrl(ref);
  const nickname = uniqueNickname(
    baseNicknameFor(redeemed),
    new Set(state.contacts.keys()),
  );
  const entry: ContactEntry = { url: ref, ref: redeemed, nickname };
  state.contacts.set(nickname, entry);
  return entry;
}

/**
 * Resolve a service reference (nickname or ref) to a service entry.
 *
 * @param ref - Nickname or ref.
 * @param state - The plugin state.
 * @returns The ServiceEntry.
 */
export function resolveService(ref: string, state: PluginState): ServiceEntry {
  const byNickname = state.services.get(ref);
  if (byNickname) {
    return byNickname;
  }
  if (isRef(ref)) {
    const byRef = [...state.services.values()].find(
      (entry) => entry.ref === ref,
    );
    if (byRef) {
      return byRef;
    }
  }
  const available = [...state.services.keys()];
  const hint =
    available.length > 0
      ? ` Available: ${available.join(', ')}.`
      : ' No services obtained yet. Use `service_initiate_contact` first.';
  throw new Error(`Unknown service "${ref}".${hint}`);
}
