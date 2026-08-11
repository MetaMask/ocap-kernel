# `@openclaw/ocap-tools`

OpenClaw plugin giving an LLM agent its whole interface to an OCAP kernel
daemon, in two independent toolsets:

- **discovery** — find services through a service matcher and consume them
  using the contact protocol from `@metamask/service-discovery-types`.
  Nothing here is specific to any one demo.
- **orchestration** — bookkeeping for the product-orchestration demo
  (artifacts, wallet, phase announcements). Each call posts an event to a
  `demo-display` server, which drives the audience-facing dashboard
  (marketplace grid, transcript, artifact panel, workflow board).

This was previously two plugins, `discovery` and `demo`, which carried
byte-identical copies of the daemon caller, artifact store, and wire types
and opened a socket connection each. They are one plugin now: one
connection, one `ocapHome` to configure, one copy of the shared plumbing.
The toolsets keep separate state modules (`discovery/state.ts`,
`orchestration/state.ts`) because their state has nothing in common.

## Install

```bash
openclaw plugins install --link ./packages/agentmask/openclaw-plugin-ocap-tools
openclaw plugins enable ocapTools
openclaw config set plugins.allow '["ocapTools"]'
```

## Configure

Plugin config (`openclaw config set 'plugins.entries.ocapTools.config.<key>'
<value>`) and environment variables are both honored; env wins.

| Key                       | Env var                           | Description                                                                                                       |
| ------------------------- | --------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `ocapHome`                | `OCAP_HOME`                       | OCAP home of the daemon to talk to; the vat socket is `<ocapHome>/ocap-jsonrpc.sock`. Default `~/.ocap-consumer`. |
| `socketPath`              | `OCAP_JSONRPC_SOCKET`             | Absolute path of the vat socket. Overrides `ocapHome`.                                                            |
| `timeoutMs`               | `OCAP_TIMEOUT_MS`                 | Timeout for daemon calls in ms. Default `60000`.                                                                  |
| `displayUrl`              | `DEMO_DISPLAY_URL`                | Base URL of the demo-display server. Default `http://127.0.0.1:7777`.                                             |
| `matcherUrl`              | `MATCHER_OCAP_URL`                | OCAP URL of the service matcher. Redeemed eagerly on register.                                                    |
| `walletUrl`               | `DEMO_WALLET_OCAP_URL`            | OCAP URL of the wallet vat. Auto-discovered from `<ocapHome>/wallet-url.env` when unset.                          |
| `walletInitialBalanceUsd` | `DEMO_WALLET_INITIAL_BALANCE_USD` | Balance to seed on register so each rehearsal starts known. Default `10000`.                                      |
| `resetState`              | `OCAP_RESET_STATE`                | Clear plugin state on `register()`. Default `false`.                                                              |

When `matcherUrl` is set the plugin redeems it on register, so the agent can
call `discovery_find_services` without an explicit connection step. Likewise
`walletUrl` is redeemed and the balance seeded, so the wallet tools work on
first call.

## Tools

| Tool                       | Purpose                                                              |
| -------------------------- | -------------------------------------------------------------------- |
| `discovery_redeem_matcher` | Redeem the matcher's OCAP URL. Needed only if `matcherUrl` is unset  |
| `discovery_find_services`  | Ask the matcher for services matching a natural-language description |
| `discovery_list_tracked`   | List the services and contacts obtained so far                       |
| `service_get_description`  | Fetch a service's self-description                                   |
| `service_initiate_contact` | Initiate contact with a service via the contact protocol             |
| `service_call`             | Call a method on a service                                           |
| `demo_announce`            | Surface a phase transition or one-line narration to the display      |
| `demo_record_artifact`     | Register an artifact and get an opaque handle                        |
| `demo_get_artifact`        | Fetch a previously-recorded artifact by handle                       |
| `demo_wallet_balance`      | Read the inventor's wallet balance                                   |
| `demo_wallet_credit`       | Credit the wallet                                                    |
| `demo_wallet_withdraw`     | Withdraw from the wallet                                             |
| `demo_phase_started`       | Mark a pipeline phase as started on the workflow board               |
| `demo_service_completed`   | Mark a service's work as complete on the workflow board              |

## Skills

OpenClaw auto-loads skills from a plugin's `skills/` directory. Two are
shipped, kept separate because discovery is a reusable building block that
does not depend on the demo:

- `skills/discovery/SKILL.md` — driving a service-discovery client. Also
  documents the discovery tool workflow in full.
- `skills/product-orchestration/SKILL.md` — the producer / general
  contractor persona for the demo: the pipeline, narration style, hard
  rules, and a worked opening.

Invoke one by name (`discovery`, `product-orchestration`), or let openclaw
surface it based on the active `tools.profile`.

## Limitations

The orchestration tools do not auto-tap the discovery tools' calls. OpenClaw
exposes no cross-plugin — or cross-toolset — call observer, so the agent
surfaces its discovery activity by calling `demo_announce` itself as it
narrates. The audience sees the agent's narration, not the underlying tool
invocations.

## Contributing

This plugin is part of the ocap-kernel monorepo.
