# VPS-side rehearsal checklist for the ocap-jsonrpc-vat

The vat replaces the openclaw plugins' shell-execed `ocap daemon
queueMessage`/`redeem-url` calls with a persistent JSON-RPC 2.0
connection over a Unix socket. On the VPS, the vat lives in the
consumer daemon (`~/.ocap-consumer`), which had no vats previously.

## Prerequisites

- The chip/orchestration-demo branch is checked out at the same path
  as before (openclaw plugins install with `-l` from the workspace,
  so the branch update is picked up automatically).
- The matcher daemon (`~/.ocap`) is running with remote comms
  initialised, as usual.
- The consumer daemon (`~/.ocap-consumer`) is running with remote
  comms initialised. `reset-everything.sh` starts it with
  `--local-relay`; that stays the same.
- `yarn workspace @metamask/kernel-cli build` and
  `yarn workspace @ocap/ocap-jsonrpc-vat build` have run at least
  once since the branch update.

## Launch the vat

Run inside the repo:

```bash
./packages/ocap-jsonrpc-vat/scripts/start-ocap-jsonrpc-vat.sh \
  --home ~/.ocap-consumer
```

Confirm the socket:

```bash
ls -l ~/.ocap-consumer/ocap-jsonrpc.sock
node ./packages/ocap-jsonrpc-vat/scripts/probe.mjs \
  ~/.ocap-consumer/ocap-jsonrpc.sock
```

The probe should print an `initialize`-less handshake with an empty
`redeemURL` payload succeeding, or with a bogus URL succeeding at the
JSON-RPC layer and failing at the redemption layer with
`Remote comms not initialized` if you haven't kicked comms yet.

## Update openclaw plugin configs

Edit `~/.openclaw/openclaw.json`. For each of the three plugins in
`plugins.entries` (`discovery`, `metamask`, `demo`):

- **Remove** `ocapCliPath`. The plugin no longer spawns the CLI.
- **Add or change** `ocapHome` to `~/.ocap-consumer`. All three
  plugins should point at the same consumer-daemon socket.

Alternatively set `socketPath` explicitly per plugin if you want to
override.

Example diff:

```jsonc
"discovery": {
  "config": {
-   "ocapCliPath": "/root/…/packages/kernel-cli/dist/app.mjs",
+   "ocapHome": "/root/.ocap-consumer",
    "matcherUrl": "ocap:…"
  }
}
```

Restart openclaw so the plugins re-register with the new configs.

## Sanity check before an LLM turn

- `discovery_list_tracked` should show the matcher URL pre-redeemed
  and its ref shown as `@@o<n>` (was previously a kref).
- A `discovery_find_services` turn against the matcher should behave
  as before — matcher on VPS, provider vats on laptop are untouched.

## What changes on the laptop side

Nothing structural. The laptop's provider vats and consumer daemon
keep their existing OCAP URLs. The plugins on VPS reach them through
the same libp2p path; only the plugin-to-kernel hop changed.
