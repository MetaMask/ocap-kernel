# VPS-side rehearsal notes for the ocap-jsonrpc-vat

The vat replaces the openclaw plugins' shell-execed `ocap daemon
queueMessage`/`redeem-url` calls with a persistent JSON-RPC 2.0
connection over a Unix socket. On the VPS it lives in the consumer
daemon (`~/.ocap-consumer`), which had no vats previously.

Both routine restarts and cold resets are automated:

- `rehearsal-restart-matcher.sh` — routine pre-rehearsal reset (URL,
  registry, and vats stay put). Now includes a step 2b that runs
  `start-ocap-jsonrpc-vat.sh --home ~/.ocap-consumer`.
- `reset-everything.sh` — cold reset with fresh URLs. Now includes a
  step 7b that launches a fresh vat subcluster in the consumer
  daemon.

So the operator does not have to invoke the vat launcher directly in
normal rehearsal flow. The manual launcher (below) is only for
debugging or ad-hoc use.

## Prerequisites

- The chip/orchestration-demo branch is checked out at the same path
  as before (openclaw plugins install with `-l` from the workspace,
  so the branch update is picked up automatically).
- `yarn workspace @metamask/kernel-cli build` and
  `yarn workspace @ocap/ocap-jsonrpc-vat build` have run at least
  once since the branch update.

## Manual launch (for debugging)

```bash
./packages/ocap-jsonrpc-vat/scripts/start-ocap-jsonrpc-vat.sh \
  --home ~/.ocap-consumer
```

Confirm the socket:

```bash
ls -l ~/.ocap-consumer/ocap-jsonrpc.sock
node ./packages/ocap-jsonrpc-vat/scripts/probe.mjs \
  ~/.ocap-consumer/ocap-jsonrpc.sock ocap:some@peer
```

The probe should print a `redeemURL` request whose response is either
a `@@j<n>` marker (on success) or a `[KERNEL:DELIVERY_FAILED]` error
if the URL doesn't resolve or remote comms are down.

## Openclaw plugin config

For each of the three plugins in `~/.openclaw/openclaw.json` under
`plugins.entries` (`discovery`, `metamask`, `demo`):

- **Remove** `ocapCliPath`. The plugin's config schema no longer
  accepts it — leaving it in will fail plugin registration.
- **Add or change** `ocapHome` to `~/.ocap-consumer`. All three
  plugins point at the same consumer-daemon socket.

Alternatively set `socketPath` explicitly per plugin.

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

Then restart openclaw (rehearsal-restart-matcher.sh does this in
step 3).

## Sanity check before an LLM turn

- `discovery_list_tracked` should show the matcher URL pre-redeemed
  and its ref shown as `@@j<n>` (was previously a kref).
- A `discovery_find_services` turn against the matcher should behave
  as before — matcher on VPS, provider vats on laptop are untouched.

## What changes on the laptop side

Nothing structural. The laptop's provider vats and consumer daemon
keep their existing OCAP URLs. The plugins on VPS reach them through
the same libp2p path; only the plugin-to-kernel hop changed.
