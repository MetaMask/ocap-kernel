# Service Discovery Prototype — Plan

## Scope

Build a working demo of the service-discovery model described in
`discovery.md`, using the preliminary types in `discovery-types.ts` and
learning from the deconstruction of the current demo captured in
`discovery-analysis.md`.

Three cooperating components plus a shared relay:

- **Provider**: MetaMask extension's offscreen ocap-kernel subcluster
  (existing, in `~/GitRepos/metamask-extension`, on the current branch).
- **Matcher**: ocap-kernel daemon hosting a matcher vat + OpenClaw LLM
  agent. Runs on external VPS.
- **Consumer**: ocap-kernel daemon + OpenClaw LLM agent. Runs on external
  VPS.
- **Relay**: libp2p relay, unchanged from the current demo.

## Design questions to resolve before Phase 1

1. **Provider → Matcher registration transport**: Provider redeems a
   matcher registration OCAP URL supplied via environment. When the
   provider runs inside the MetaMask browser plugin, the URL is placed
   in `.metamaskrc` alongside `OCAP_RELAY_MULTIADDR` (e.g. as
   `OCAP_MATCHER_URL`). **Resolved.**
2. **Consumer ↔ Matcher NL channel**: Resolved by the types file.
   `ServiceMatcher.findServices(query)` is an ocap method taking a
   structured `ServiceQuery = { description: string }` and returning
   `ServiceMatch[]`. The matcher vat internally dispatches to its LLM
   agent via a kernel-service event hook. No external HTTP endpoint.
3. **Fate of the LLM-generates-source-code flow**: Drop
   `Compartment.evaluate(sourceCode)`. Services are pre-existing, not
   code-gen'd. `PersonalMessageSigner` becomes a statically-coded exo
   behind a contact endpoint. **Resolved.**
4. **Access model for initial demo**: Public API only for v1,
   retaining per-call `ApprovalController` prompts for sensitive
   operations like `signMessage`. Permissioned and ValidatedClient are
   out of scope for phase 1. **Resolved.**
5. **Mock services**: Start with the real MetaMask service plus 1–2
   trivial mock services colocated in the provider subcluster, so the
   matcher has meaningful candidates to rank. **Resolved.**

## Key design elements from `discovery-types.ts`

- **Registration token handshake**: Provider generates a nonce per
  service; ships it in `registerService(description, registrationToken)`.
  Matcher later calls `ContactPoint.confirmServiceRegistration(token)`
  on the contact endpoint to verify the registration is legitimate
  before accepting it.
- **Multiple contact points per service**: `ServiceDescription.contact`
  is an array of `ServiceContactInfo`, each with a `ContactType`
  (`'public' | 'permissioned' | 'validatedClient'`) and a URL. Phase 1
  will implement the single-contact-per-service case but the data
  plumbing will preserve the array shape.
- **`TypeSpec` vs `MethodSchema`**: `TypeSpec`/`ObjectSpec`/
  `RemotableSpec` are richer than the existing `MethodSchema` in
  `@metamask/kernel-utils`. Strategy: treat `TypeSpec` as the canonical
  wire format and write a one-way converter from `MethodSchema` to
  `ObjectSpec`/`RemotableSpec`. Existing `makeDiscoverableExo` machinery
  (including the recent `__getDescription__` work on the current branch)
  stays untouched; the contact endpoint translates when publishing a
  `ServiceDescription`.

## Phased plan

Between each phase: stop, check with user, commit that phase's changes
before proceeding. Do not push until all phases are approved.

### Phase 0 — Shared types + design notes

No behavior changes. Establish the shared wire format.

- Create a thin package (`packages/service-discovery-types/` or
  equivalent; location TBD with user) housing the types from
  `discovery-types.ts`, with:
  - The union-syntax errors in `TypeSpec` fixed.
  - `@metamask/superstruct` runtime validators for each type.
  - `harden`-safe construction helpers.
- Write a short design-notes doc capturing:
  - The registration-token handshake.
  - The `MethodSchema` → `ObjectSpec`/`RemotableSpec` mapping.
  - How `makeDiscoverableExo` interoperates with
    `ContactPoint.getServiceDescription`.

### Phase 1 — Refactor the Provider (MetaMask extension)

Cross-repo work in `~/GitRepos/metamask-extension/app/offscreen/ocap-kernel/`.

- Replace the `llm-service` + `Compartment.evaluate` machinery in the
  vendor vat with a static `PersonalMessageSigner` exo, plus 1–2 mock
  services, each with its own contact-endpoint exo.
- Repurpose the "vendor" vat as a "contact point" vat that publishes
  N contact endpoints and N `ServiceDescription`s (one per service).
- Add a registration client in the vat that, at bootstrap:
  - Generates a `registrationToken` per service.
  - Calls `E(matcherRegistration).registerServiceByRef(contactEndpoint,
token)` (or `registerService(description, token)`), using a matcher
    URL from `.metamaskrc`.
  - Implements `confirmServiceRegistration(token)` on each contact
    endpoint for the matcher's callback.
- UI update: show contact URL(s) rather than a single vendor URL, or
  drop the UI step once matcher-driven discovery works (keep as
  fallback).
- Per-call user approval for sensitive operations remains.

### Phase 2 — Build the Matcher

New package in this repo: `packages/service-matcher/` (name TBD).
New OpenClaw plugin: `packages/agentmask/openclaw-plugin-matcher/`.

- Matcher vat:
  - `ServiceMatcher` exo implementing `registerService`,
    `registerServiceByUrl`, `registerServiceByRef`, `findServices`.
  - Calls `confirmServiceRegistration` on the contact endpoint to
    validate registration tokens before accepting a service.
  - In-memory registry of `ServiceDescription`s.
  - Kernel-service event hook that the LLM side reads to perform
    matching on `findServices` queries.
- Matcher LLM driver (OpenClaw plugin):
  - Listens on the event hook for match requests.
  - Has tools to enumerate and inspect registered services.
  - Produces ranked `ServiceMatch[]` with rationale, returned via the
    event hook back to the vat.
- Daemon bridge for the OpenClaw side (patterned after the existing
  `makeDaemonCaller`).

### Phase 3 — Build the Consumer

New OpenClaw plugin: `packages/agentmask/openclaw-plugin-discovery/`,
generalizing (not forking) the current metamask plugin.

- Tools:
  - `discovery_redeem_matcher(url)` — redeem matcher URL, obtain kref.
  - `discovery_find_services(description)` — call `findServices` on
    the matcher.
  - `service_get_description(contactUrl)` — redeem + call
    `getServiceDescription`.
  - `service_initiate_contact(contactUrl)` — call `initiateContact`
    and handle the `ContactResponse` variant.
  - `service_call(kref, method, args)` — generalized capability-call
    tool (replaces `metamask_call_capability`).
- Update `SKILL.md` to describe the end-to-end flow.
- Either retire the metamask-specific plugin or have it delegate to
  the generalized one.

### Phase 4 — End-to-end demo + docs

- Write a successor to `demo-two-way-comms.md` walking through:
  Provider boot → Matcher registration (with token callback) →
  Consumer NL query → contact → service use.
- Shake down over relay; fix rough edges.
- Expect at least one revision round on the matcher LLM prompt.

## Risks and caveats

- Phase 1 is the riskiest: cross-repo changes in `metamask-extension`.
  Confirm the current branch there is safe to commit into.
- The matcher LLM prompt will need iteration. Plan on ≥1 revision round
  after Phase 4.
- `TypeSpec` ↔ `MethodSchema` mapping may reveal edge cases in existing
  discoverable exos; track as they appear.
