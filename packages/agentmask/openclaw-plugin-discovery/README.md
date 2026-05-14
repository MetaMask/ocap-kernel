# `@openclaw/discovery`

OpenClaw plugin that lets an LLM agent discover and consume services via a
service matcher, using the contact protocol from
`@metamask/service-discovery-types`.

## Install

```bash
openclaw plugins install -l ./packages/agentmask/openclaw-plugin-discovery
openclaw plugins enable discovery
openclaw config set plugins.allow '["discovery"]'
openclaw config set tools.allow '["discovery"]'
```

## Configure (optional)

The plugin reads config from OpenClaw plugin settings and from environment
variables (env takes precedence):

| Key           | Env var            | Description                                                                |
| ------------- | ------------------ | -------------------------------------------------------------------------- |
| `ocapCliPath` | `OCAP_CLI_PATH`    | Absolute path to the `ocap` CLI entry point.                               |
| `ocapHome`    | `OCAP_HOME`        | OCAP home directory for the daemon this plugin targets. Default `~/.ocap`. |
| `matcherUrl`  | `OCAP_MATCHER_URL` | OCAP URL for the service matcher. Pre-redeemed at startup.                 |
| `timeoutMs`   | `OCAP_TIMEOUT_MS`  | Timeout for daemon calls in ms (default `60000`).                          |
| `resetState`  | `OCAP_RESET_STATE` | Clear plugin state on `register()` (default `false`).                      |

If `matcherUrl` is supplied, the plugin redeems it eagerly on register so
the agent can start calling `discovery_find_services` without an explicit
connection step.

## Tools

See `skills/discovery/SKILL.md` for the full tool list and workflow.

## Contributing

This plugin is part of the ocap-kernel monorepo.
