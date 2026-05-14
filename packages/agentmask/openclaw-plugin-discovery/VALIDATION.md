# Phase 3 validation — `@openclaw/discovery`

This document walks through end-to-end validation of the discovery
plugin against a running Phase 1 provider (MetaMask extension) and a
Phase 2 matcher (daemon on VPS). Everything lives on a single VPS.

## Topology

```
                          VPS
┌─────────────────────────────────────────────────────┐
│  relay (libp2p) — writes ~/.ocap/relay.addr         │
│                                                     │
│  matcher daemon   — OCAP_HOME=~/.ocap-matcher       │
│    (subcluster running the matcher vat)             │
│                                                     │
│  consumer daemon  — OCAP_HOME=~/.ocap-consumer      │
│    (no subclusters; hosts the openclaw plugin's     │
│     RPC target)                                     │
│                                                     │
│  openclaw + @openclaw/discovery                     │
│    (drives the consumer daemon via RPC)             │
└─────────────────────────────────────────────────────┘
                           │ relay hints
                           ▼
                Browser on laptop
    MetaMask extension with provider vats
        registered against the matcher
```

Two daemons live on the same VPS with different home directories so
they don't clobber each other's state. Each `ocap` invocation that
needs to talk to one of them passes `--home <dir>` explicitly, so
there is no shell-state contamination across context switches.
Matcher and consumer talk to each other over the relay, same as they
would across machines — the shared VPS is purely for convenience
during dev.

## Prerequisites

Three things must be live before starting this validation:

1. **Relay** on the VPS (`yarn ocap relay`; writes
   `~/.ocap/relay.addr`). Leave it running.
2. **Matcher daemon** on the VPS
   (`packages/service-matcher/scripts/start-matcher.sh`). It prints
   the matcher OCAP URL on stdout — keep it.
3. **Provider** — MetaMask extension loaded in a browser with the
   matcher URL baked in via `.metamaskrc`
   (`OCAP_MATCHER_URL=…`), webpack rebuilt, extension reloaded. The
   offscreen console should show the three registration-success
   lines; the matcher daemon log should show three
   `[matcher] registered svc:N:` lines.

## Stage A — Install the discovery plugin

### A.1. Start the consumer daemon under its own home

The matcher daemon is already running under the default
`~/.ocap`. Start the consumer daemon under `~/.ocap-consumer`:

```bash
mkdir -p ~/.ocap-consumer
yarn ocap --home ~/.ocap-consumer daemon start
yarn ocap --home ~/.ocap-consumer daemon exec initRemoteComms \
  "{\"relays\": [\"$(cat ~/.ocap/relay.addr)\"]}"
```

Every subsequent `yarn ocap` invocation that wants to talk to the
consumer daemon must include `--home ~/.ocap-consumer`. Without it,
`yarn ocap` defaults to `~/.ocap` and addresses the matcher daemon
instead.

Confirm `getStatus` shows `remoteComms.state === "connected"`:

```bash
yarn ocap --home ~/.ocap-consumer daemon exec getStatus
```

### A.2. Install and enable the plugin

```bash
cd ~/GitRepos/ocap-kernel
openclaw plugins install -l ./packages/agentmask/openclaw-plugin-discovery
openclaw plugins enable discovery
openclaw config set plugins.allow '["discovery"]'
# tools.allow matches tool names, not plugin ids: list each tool the
# plugin exposes. (`openclaw config unset tools.allow` to allow all
# tools is also fine for development.)
openclaw config set tools.allow '["discovery_redeem_matcher","discovery_find_services","service_get_description","service_initiate_contact","service_call","discovery_list_tracked"]'
```

`tools.profile` filters tool visibility _independently_ of `tools.allow`.
The default `coding` profile excludes the discovery tools entirely, so
the LLM sees zero discovery surface even with `tools.allow` correctly
populated. Drop the profile (or pick one that includes plugin tools):

```bash
openclaw config unset tools.profile
openclaw config get tools     # confirm: no "profile" field
```

For this validation, also disable the older metamask plugin if it was
previously installed — its SKILL.md primes the agent toward
wallet-specific behavior and competes with discovery:

```bash
openclaw plugins disable metamask
```

After any of the above changes, restart the openclaw gateway service
(`openclaw config set` prompts for this).

### A.3. Point the plugin at the consumer daemon + matcher URL

Use plugin config so the settings are durable across shells (no env
juggling required):

```bash
openclaw config set 'plugins.entries.discovery.config.ocapHome' "$HOME/.ocap-consumer"
openclaw config set 'plugins.entries.discovery.config.ocapCliPath' '/abs/path/to/ocap-kernel/packages/kernel-cli/dist/app.mjs'
openclaw config set 'plugins.entries.discovery.config.matcherUrl' 'ocap:…'
```

(The path is `plugins.entries.<plugin-id>.config.<key>` — the
`plugins.discovery.<key>` shorthand does not exist in the openclaw
config schema.)

`ocapHome` is what makes the plugin pass `--home ~/.ocap-consumer` on
every spawned `ocap` invocation, so it talks to the consumer daemon
rather than the matcher's default-home daemon.

If `matcherUrl` is supplied, the plugin redeems it eagerly at
register-time. Otherwise the first action is
`discovery_redeem_matcher`.

## Stage B — Tool-level shakedown

Drive this from `openclaw tui` (or via the CLI if you prefer). The
agent's conversation is the script; the listed tool calls are what
the agent should end up making. Paste the matcher OCAP URL in
response to the agent's first question if `matcherUrl` was not
pre-configured.

> **TUI tips, learned the hard way:**
>
> - To clear conversation context inside the running TUI, the slash
>   command is `/reset`. (`/clear` and `/new` are not recognized.)
>   Conversation history persists across `tui` restarts; if you want a
>   genuinely clean state, `/reset` is the easiest path.
> - As a sanity check before continuing, ask the agent:
>   _"Without taking any action, list every tool whose name starts
>   with `discovery_` or `service_`."_
>   It should list all six. If it lists fewer or none, revisit
>   `tools.allow` and `tools.profile` in stage A.2.

1. **Connect to matcher.**

   _You:_ "Connect to the service matcher at `<matcher URL>`."

   Expected tool: `discovery_redeem_matcher(url: "ocap:…")`.
   Expected response: `Matcher kref: koN`. (Skip this step if
   `matcherUrl` was pre-configured.)

2. **Find services.**

   _You:_ "Find me a service that can sign a message with my wallet."

   Expected tool: `discovery_find_services(description: "sign a
message with my wallet")`. Expected response: three candidates —
   PersonalMessageSigner, EchoService, RandomNumberService — each
   with a `contact (public): ocap:…` URL. (Matcher ranking is a
   Phase-2 follow-up; the agent should pick PMS by reading the
   descriptions.)

3. **Inspect PMS.**

   _You:_ "Show me what that wallet service can do."

   Expected tool: `service_get_description(contact: "<PMS contact URL>")`.
   Expected response: ServiceDescription with `getAccounts` and
   `signMessage` in the remotable spec.

4. **Obtain the PMS service.**

   _You:_ "Connect to it."

   Expected tool: `service_initiate_contact(contact: "<PMS contact URL>")`.
   Expected response: `Obtained service "PersonalMessageSigner" (kref koN)`.
   Expected provider-side: **no** approval popup at this point —
   contact initiation itself is Public.

5. **List accounts.**

   _You:_ "What accounts do I have?"

   Expected tool: `service_call(service: "PersonalMessageSigner", method: "getAccounts")`.
   Expected response: array of 0x-prefixed addresses.

6. **Sign a message.**

   _You:_ "Sign 'hello world' with the first one."

   Expected tool: `service_call(service: "PersonalMessageSigner",
method: "signMessage", args: '["0x…", "hello world", "0x1"]')`.
   Expected provider-side: **approval popup in the browser**. Approve
   it. Expected response: hex signature.

7. **Inventory.**

   _You:_ "What services do you have access to right now?"

   Expected tool: `discovery_list_tracked`. Expected response:
   matcher + one contact + one service (PMS).

## Stage C — Exercise the other two services

Repeat steps 3–5 for `EchoService` and `RandomNumberService`:

- Echo: call `echo("testing 1 2 3")`; expect `"testing 1 2 3"`.
- RandomNumber: call `randomInt(1, 100)`; expect an integer in
  [1, 100]. Call `randomFloat()`; expect a float in [0, 1).

Neither triggers an approval popup — they have no access-controlled
backing.

After these, `discovery_list_tracked` should show 3 contacts and 3
services.

## Stage D — Failure-path sanity

Light-touch. Prompts the agent to hit edge cases.

- Start a fresh `openclaw tui` session (so the plugin state is
  clean) and, **without** running `discovery_redeem_matcher`, say
  "find a service that signs messages." The `discovery_find_services`
  tool should reject with the "No matcher connection. …" guidance
  string from `requireMatcher`.
- Ask the agent to call an unknown capability:
  "call `doThing` on the NotARealService service." The
  `service_call` tool should reject with "Unknown service …
  Available: …".
- (Informational only) `service_initiate_contact` on a Public
  contact should succeed with a service reference; a non-Public
  response would be reported as "non-public response". We don't
  currently have a non-Public contact to test this branch against.

## What "passing" looks like

- Stage B steps 1–7 each complete with the expected tool call and
  response.
- The matcher daemon log shows a new `[matcher] findServices(…) → 3
match(es)` entry for every query.
- The offscreen console log shows one approval/signing exchange per
  `signMessage` call, with no regressions in the underlying
  `hostApiProxy` path.
- Stage C steps complete without triggering the browser (services
  are self-contained).
- Stage D produces clear, user-legible errors.

## Known limitations going in

- Matcher `findServices` returns **all** registered services
  unranked — the LLM does the picking from descriptions.
- Matcher URL is **ephemeral** per restart (planned follow-up:
  baggage-backed stable URL).
- Matcher registry accumulates duplicates on provider restart
  (planned follow-up: dedup/liveness).
- Provider restart without a matcher restart triggers ocap-kernel
  issue #944 (duplicate-seq).
- Only Public access model is wired end-to-end. Permissioned and
  ValidatedClient contact responses are reported verbatim but not
  driven through.
