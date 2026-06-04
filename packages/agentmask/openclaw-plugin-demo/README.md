# `@openclaw/demo`

OpenClaw plugin for the orchestration demo. Provides bookkeeping
tools the agent invokes to record artifacts, advance the workflow
board, and read the wallet balance. Each tool call posts a
corresponding event to a `demo-display` server, which drives the
audience-facing dashboard (marketplace grid, transcript, artifact
panel, workflow board).

## Install

```bash
openclaw plugins install -l ./packages/agentmask/openclaw-plugin-demo
openclaw plugins enable demo
openclaw config set plugins.allow '["discovery", "demo"]'
openclaw config set tools.allow '["discovery_redeem_matcher","discovery_find_services","service_get_description","service_initiate_contact","service_call","discovery_list_tracked","demo_announce","demo_record_artifact","demo_get_artifact","demo_wallet_balance"]'
```

## Tools

| Tool                   | Purpose                                                                  |
| ---------------------- | ------------------------------------------------------------------------ |
| `demo_announce`        | Surface a workflow-phase transition or one-line narration to the display |
| `demo_record_artifact` | Register an artifact and get an opaque handle                            |
| `demo_get_artifact`    | Fetch a previously-recorded artifact by handle                           |
| `demo_wallet_balance`  | Read the inventor's wallet balance                                       |

## Configure (optional)

Both plugin config (`openclaw config set 'plugins.entries.demo.config.<key>' <value>`) and environment variables are honored; env wins.

| Key                       | Env var                           | Default                 |
| ------------------------- | --------------------------------- | ----------------------- |
| `displayUrl`              | `DEMO_DISPLAY_URL`                | `http://127.0.0.1:7777` |
| `walletInitialBalanceUsd` | `DEMO_WALLET_INITIAL_BALANCE_USD` | `10000`                 |

## Limitations

The plugin does NOT auto-tap the discovery plugin's tool calls.
OpenClaw doesn't expose a cross-plugin call observer, so the agent
surfaces its discovery/service activity by calling `demo_announce`
itself as it narrates each step. The audience sees the agent's
narration, not the underlying tool invocations.
