# OpenClaw MetaMask Plugin

OpenClaw plugin that lets an LLM agent request and use capabilities from a MetaMask capability vendor via the OCAP kernel daemon.

## Prerequisites

- OCAP daemon running (`ocap daemon start`)
- OCAP URL obtained from the home side (see [demo-two-way-comms](../docs/demo-two-way-comms.md))
- [OpenClaw](https://openclaw.dev) installed

## Configuration

Copy `.env.example` to `.env` and set the OCAP URL:

```bash
cp .env.example .env
# Edit .env and paste your OCAP URL
```

All config can be set via environment variables or OpenClaw plugin settings. Env vars take precedence.

| Key           | Env Var            | Type    | Default     | Description                          |
| ------------- | ------------------ | ------- | ----------- | ------------------------------------ |
| `ocapCliPath` | `OCAP_CLI_PATH`    | string  | auto-detect | Path to `ocap` CLI                   |
| `ocapUrl`     | `OCAP_URL`         | string  | —           | OCAP URL for the vendor public facet |
| `timeoutMs`   | `OCAP_TIMEOUT_MS`  | number  | 60000       | Daemon call timeout                  |
| `resetState`  | `OCAP_RESET_STATE` | boolean | false       | Clear plugin state on register       |

## Install

```bash
openclaw plugins install -l ./packages/agentmask/openclaw-plugin-metamask
```

## Enable

```bash
openclaw plugins enable metamask
openclaw config set plugins.allow '["metamask"]'
openclaw config set tools.allow '["metamask"]'
```

## Usage

Start OpenClaw TUI and interact with the agent:

```bash
openclaw tui
```

Example conversation:

1. **You**: "What capabilities do you have?"
2. **Agent**: [Lists available capabilities (none initially)]
3. **You**: "I want you to be able to sign messages with my MetaMask wallet"
4. **Agent**: [Requests a `PersonalMessageSigner` capability from the vendor]
5. **You**: "What accounts are available?"
6. **Agent**: [Calls `getAccounts()` on the capability]
7. **You**: "Sign 'hello world' with the first account"
8. **Agent**: [Calls `signMessage()` with the address, message, and chain ID]

## Starting Fresh

Plugin state (vendor kref, capability map) lives in the OpenClaw process. Kernel state (krefs, CapTP connections) lives in the daemon. These are independent.

- **Plugin state only**: restart OpenClaw (with `OCAP_RESET_STATE=true` in `.env`)
- **Kernel state only**: `ocap daemon purge --force`, then restart the daemon. You must also restart OpenClaw since cached krefs are now stale.
- **Full reset**: purge the daemon, restart the daemon, restart OpenClaw

## Tools

- **metamask_request_capability** - Request a capability from the vendor
- **metamask_call_capability** - Call a method on an obtained capability
- **metamask_list_capabilities** - List all obtained capabilities
