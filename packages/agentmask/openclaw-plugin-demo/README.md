# `@openclaw/demo`

OpenClaw plugin for the AI-orchestration demo. Observes the agent's
tool calls (find/contact/call) and provides bookkeeping tools the
agent invokes to record artifacts, advance the workflow board, and
read the wallet balance.

The plugin posts events to a `demo-display` server that drives the
audience-facing dashboard (marketplace grid, transcript, artifact
panel, workflow board).

## Install

```bash
openclaw plugins install -l ./packages/agentmask/openclaw-plugin-demo
openclaw plugins enable demo
openclaw config set plugins.allow '["discovery", "demo"]'
openclaw config set tools.allow '["discovery", "demo"]'
```

## Configure (optional)

| Key          | Description                                                      |
| ------------ | ---------------------------------------------------------------- |
| `displayUrl` | Base URL of the demo-display server (default in a later commit). |

## Status

Scaffold only. Tools (`demo_record_artifact`, `demo_get_artifact`,
`demo_wallet_balance`, `demo_announce`) and the event tap will land
once `demo-display`'s event endpoint is in place.
