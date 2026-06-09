# Orchestration demo — dry-run playbook

Living document. Captures the topology, terminal session
allocation, setup sequence, and per-run procedure for driving the
orchestration demo end-to-end. Add notes in the "Notes from runs"
section after each pass.

---

## Topology

Two machines:

- **VPS** — hosts the relay, the matcher daemon, the consumer daemon,
  the demo-display server, and the OpenClaw gateway (where the
  producer LLM runs). All LLM activity stays here so the laptop
  doesn't take on that surface.
- **Laptop** — hosts the sample-services daemon (the V0 service
  vats register from here over the relay), the browser viewing the
  dashboard, and the SSH sessions that connect to the VPS.

The inventor (= presenter) sits at the laptop. They drive the
producer LLM by typing into an OpenClaw TUI session that **runs on
the VPS but renders over SSH** in a laptop terminal.

```
                        ┌──── VPS ────┐
   ssh sessions  ◀────▶ │  relay      │
                        │  matcher    │
                        │  consumer   │
                        │  demo-display│
                        │  openclaw   │
                        └─────────────┘
                              ▲
                              │ relay
                              ▼
                        ┌─── Laptop ──┐
                        │  sample-svcs│
                        │  browser    │ ◀── dashboard
                        │  terminals  │
                        └─────────────┘
```

---

## Terminal sessions

Use the labels below; they're referenced by name in the per-run
procedure. Sizes are nominal — adjust to whatever fits your
display layout, but reserve the "large" slots for genuinely
interactive sessions.

### Small windows (logs and long-running silents)

| Label              | Machine | Purpose                                                                            |
| ------------------ | ------- | ---------------------------------------------------------------------------------- |
| `vps-relay`        | VPS     | `yarn ocap relay`. Idles after startup.                                            |
| `vps-matcher-log`  | VPS     | `tail -F ~/.ocap/daemon.log`.                                                      |
| `vps-bridge-log`   | VPS     | `tail -F ~/.ocap/matcher-llm-bridge.log`.                                          |
| `vps-consumer-log` | VPS     | `tail -F ~/.ocap-consumer/daemon.log`.                                             |
| `vps-display`      | VPS     | `yarn workspace @ocap/demo-display start`. Hosts the long-running HTTP+SSE server. |
| `laptop-svcs-log`  | Laptop  | `tail -F ~/.ocap-services/daemon.log`.                                             |

### Large windows (interactive, in-depth)

| Label            | Machine       | Purpose                                                                                                                             |
| ---------------- | ------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `vps-tui`        | VPS (via ssh) | `openclaw tui` — the inventor's interface to the producer LLM. **The primary window during the demo.**                              |
| `vps-ctl`        | VPS           | Catch-all VPS control terminal: `start-matcher.sh`, ad-hoc `ocap daemon exec ...`, file edits, ssh from this window for the others. |
| `laptop-ctl`     | Laptop        | Catch-all laptop control: `start-services.sh`, ad-hoc `curl http://127.0.0.1:7777/...`, git operations, file edits.                 |
| `laptop-browser` | Laptop        | Not a terminal — the browser window showing `http://127.0.0.1:7777/` via SSH tunnel.                                                |

### Window arrangement (suggested)

Position so the audience can see at a glance:

- **`laptop-browser`** dominant on the screen — the dashboard is the show.
- **`vps-tui`** next to or beneath the browser — the inventor's
  dialog with the producer. Big enough to read.
- The five log windows tiled in a side strip — for the presenter to
  glance at during the run; the audience doesn't need to read them.
- `vps-ctl` and `laptop-ctl` minimized until needed.

---

## One-time setup

Done once per machine, not per run.

### On the VPS

In `vps-ctl`:

```csh
cd ~/GitRepos/ocap-kernel
git fetch origin
git checkout chip/orchestration-demo
git pull
yarn install
yarn workspace @metamask/kernel-cli build
yarn workspace @ocap/service-matcher build
yarn workspace @ocap/service-matcher bundle-vat
yarn workspace @ocap/llm-bridge build
yarn workspace @ocap/demo-display build
```

Confirm the relay and llm-bridge env knobs are set in the VPS shell
profile:

```csh
setenv LIBP2P_RELAY_PUBLIC_IP <vps-public-ip>
setenv OPENCLAW_AGENT_MODEL openclaw/main
```

`OPENCLAW_AGENT_MODEL` is the model name the bridge passes to the
openclaw gateway. The gateway's chat-completions endpoint accepts
either the bare alias `openclaw` (which needs a configured default
agent) or `openclaw/<agentId>` for a specific agent. `<agentId>` is
the name of a directory under `~/.openclaw/agents/`; in current
openclaw builds that's `main`. The bridge's compiled-in default of
`openclaw` may not resolve depending on the gateway's default-agent
config, so set this explicitly. A model name the gateway can't
resolve produces HTTP 500 from `/v1/chat/completions`, which fails
service registration with an opaque "All N registrations failed"
error.

Ensure openclaw is on a recent enough version to support local-path
`openclaw skills install`. Older versions only accept ClawHub slugs:

```csh
openclaw --version
npm view openclaw version
sudo npm install -g openclaw@latest
```

Remove any pre-existing matcher URL from openclaw's config (safe on
a fresh system; per-run setup sets a fresh URL in step 5):

```csh
openclaw config unset 'plugins.entries.discovery.config.matcherUrl'
```

Install the openclaw plugins:

```csh
openclaw plugins install -l ~/GitRepos/ocap-kernel/packages/agentmask/openclaw-plugin-discovery
openclaw plugins install -l ~/GitRepos/ocap-kernel/packages/agentmask/openclaw-plugin-demo
openclaw plugins enable discovery
openclaw plugins enable demo
```

Inspect the existing `plugins.allow` and `tools.allow` lists; do
NOT wholesale-replace them, since they may already contain entries
(model backends like `anthropic` / `google`, memory plugins, etc.)
that the producer LLM needs at runtime:

```csh
openclaw config get plugins.allow
openclaw config get tools.allow
```

`plugins.allow` must include both `discovery` and `demo`. If either
is missing, add it (preserve any other entries already present),
e.g.:

```csh
openclaw config set plugins.allow '["discovery", "demo", "anthropic", "google", "memory-core"]'
```

`tools.allow` must include the ten tool names below. If any are
missing, add them (preserve any other entries already present):

```
discovery_redeem_matcher
discovery_find_services
service_get_description
service_initiate_contact
service_call
discovery_list_tracked
demo_announce
demo_record_artifact
demo_get_artifact
demo_wallet_balance
```

Set the remaining flags (these are safe to set unconditionally):

```csh
openclaw config unset tools.profile
openclaw plugins disable metamask
openclaw config set gateway.http.endpoints.chatCompletions.enabled true
```

Install the two skills the demo uses. Plugin-bundled skills are
NOT auto-discovered; they require an explicit `openclaw skills
install`. The path argument must start with `./` — absolute paths
get misclassified as slugs:

```csh
cd ~/GitRepos/ocap-kernel
openclaw skills install ./packages/agentmask/openclaw-plugin-discovery/skills/discovery
openclaw skills install ./packages/agentmask/openclaw-plugin-demo/skills/orchestration-demo
```

Confirm both appear:

```csh
openclaw skills list
```

Restart the gateway once at the end so all the preceding changes
take effect:

```csh
openclaw gateway restart
```

Each `openclaw config set` / `openclaw plugins enable|disable` prints
its own "Restart the gateway to apply" reminder; ignore those and
restart once at the end.

Each plugin install and enable step may emit a `failed to post
event to demo-display: ... ECONNREFUSED 127.0.0.1:7777` warning,
possibly more than once. The demo plugin's `register()` runs on
every (re)load and tries to post a one-shot initial event to
demo-display, which isn't running during one-time setup. Expected;
ignore. Each install succeeded as long as `Linked plugin path: ...`
appears in its output. The post fires successfully on the gateway
restart in per-run step 5.

Confirm openclaw skills:

```csh
openclaw skills list
```

Both `discovery` and `orchestration-demo` should appear, with the
expected requires-bins.

Confirm gateway token is set:

```csh
echo $OPENCLAW_GATEWAY_TOKEN
```

Should be non-empty. If unset, fetch from openclaw config:

```csh
setenv OPENCLAW_GATEWAY_TOKEN `openclaw config get gateway.auth.token`
```

### On the laptop

Sample-services is the laptop's role in the demo. From `laptop-ctl`:

```csh
cd ~/GitRepos/ocap-kernel
yarn install
yarn workspace @metamask/kernel-cli build
yarn workspace @ocap/sample-services build
yarn workspace @ocap/sample-services bundle-vats
```

The laptop is the development source for `chip/orchestration-demo`,
so no fetch/pull is needed here unless someone else has been
pushing to the branch.

---

## Per-run setup sequence

Order matters — each step's terminal stays running for the
duration of the run.

### Step 1: VPS relay

In `vps-relay`:

```csh
yarn ocap relay
```

Leave it. The relay writes `~/.libp2p-relay/relay.addr`.

### Step 2: VPS matcher + consumer daemon

In `vps-ctl`:

```csh
./packages/service-matcher/scripts/reset-everything.sh --no-build
```

Watch the final reminder block for the two URLs (matcher + observer).
Capture them:

```csh
setenv MATCHER_OCAP_URL    'ocap:<from output>'
setenv MATCHER_OBSERVER_URL 'ocap:<from output>'
```

### Step 3: VPS log tails

Open `vps-matcher-log`, `vps-bridge-log`, `vps-consumer-log` and
start tailing:

```csh
tail -F ~/.ocap/daemon.log
tail -F ~/.ocap/matcher-llm-bridge.log
tail -F ~/.ocap-consumer/daemon.log
```

(One command per window.)

### Step 4: VPS demo-display server

In `vps-display`:

```csh
env MATCHER_OBSERVER_URL="$MATCHER_OBSERVER_URL" \
    OCAP_HOME="$HOME/.ocap-consumer" \
    yarn workspace @ocap/demo-display start
```

Watch for:

```
[demo-display] Redeemed observer URL; kref=k...
[demo-display] Listening on http://127.0.0.1:7777/events
```

### Step 5: Configure the discovery plugin

In `vps-ctl`:

```csh
openclaw config set 'plugins.entries.discovery.config.ocapHome' "$HOME/.ocap-consumer"
openclaw config set 'plugins.entries.discovery.config.ocapCliPath' "$HOME/GitRepos/ocap-kernel/packages/kernel-cli/dist/app.mjs"
openclaw config set 'plugins.entries.discovery.config.matcherUrl' "$MATCHER_OCAP_URL"
openclaw gateway restart
```

### Step 6: Browser tunnel + load dashboard

From `laptop-ctl`:

```csh
ssh -L 7777:127.0.0.1:7777 <vps-host>
```

Leave that session open. In `laptop-browser`, open
`http://127.0.0.1:7777/`. Confirm: marketplace empty, workflow board
empty, transcript empty, artifact panel empty, wallet ribbon `—`.

### Step 7: Laptop sample-services daemon

In `laptop-ctl` (a different session from the SSH tunnel — that one
is occupied):

```csh
setenv OCAP_RELAY_MULTIADDR `ssh <vps-host> cat \~/.libp2p-relay/relay.addr`
setenv MATCHER_OCAP_URL    'ocap:<from VPS step 2 output>'
./packages/sample-services/scripts/start-services.sh
```

Watch for seven `info "<svc> registered."` lines (echo,
random-number, industrial-design, schematic-generation, firmware-spec,
mechanical-design, pcb-layout).

In `laptop-svcs-log`:

```csh
tail -F ~/.ocap-services/daemon.log
```

The dashboard's marketplace grid should now show seven provider
cards.

### Step 8: OpenClaw TUI

In `vps-tui` (an ssh session into the VPS):

```csh
openclaw tui
```

Once the TUI is up, ask the agent (in plain prose):

> "Without taking any action, list every tool whose name starts
> with `discovery_` or `demo_`."

It should list all ten:

```
discovery_redeem_matcher, discovery_find_services,
service_get_description, service_initiate_contact, service_call,
discovery_list_tracked, demo_announce, demo_record_artifact,
demo_get_artifact, demo_wallet_balance
```

If fewer, revisit `tools.allow` and `tools.profile` (one-time setup).

Tell the agent which skill is in play:

> "Use the orchestration-demo skill."

(Or whatever the openclaw-side mechanism is — verify in TUI help if
unclear.)

### Step 9: Begin the demo

Pitch the LSUR concept in `vps-tui`:

> "I have an idea for a less stupid universal remote — simpler than
> the ones out there, easier to use. Help me get it made."

From here you're the inventor. The producer takes over.

---

## Restarting the matcher mid-run

`reset-everything.sh` cold-starts the matcher and mints **fresh**
`MATCHER_OCAP_URL` and `MATCHER_OBSERVER_URL` values. Anything that
captured one of those URLs at startup needs to be refreshed. After
re-running step 2, redo, in order:

1. `setenv MATCHER_OCAP_URL '...'` and `setenv MATCHER_OBSERVER_URL '...'`
   from the new reset-everything output.
2. **Restart `vps-display`** with the new `MATCHER_OBSERVER_URL`
   (Ctrl-C, then re-run step 4).
3. **Redo step 5**: point the discovery plugin's `matcherUrl` at the
   new URL and restart the gateway.
4. **Redo step 7** on the laptop: re-export `MATCHER_OCAP_URL`,
   re-run `start-services.sh`.

The log tails (step 3 and the SSH tunnel from step 6) keep working
without changes.

## What to watch for during the run

Across the four visible surfaces:

| Surface                  | What good looks like                                                                                                                                                      |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `vps-tui` (dialog)       | Producer greets, restates concept in own words, asks a clarifying question or two. Doesn't enumerate the whole pipeline. Confirms direction before each phase transition. |
| Dashboard transcript     | One-line announcements track phase changes and tool-call beats. Concise. Not a literal log of every tool name.                                                            |
| Dashboard workflow board | Columns appear as phases are announced (left-to-right, in announce order). Empty until the first announcement. Active phase highlighted.                                  |
| Dashboard artifact panel | First artifact (concept sketch SVG) renders full-size after the industrial-design call completes. Updated as each new artifact arrives.                                   |
| Marketplace grid         | Stays static through the run (no churn during a normal pass).                                                                                                             |
| Wallet ribbon            | Shows `$10,000` initially (after first `wallet.balance` event). Doesn't change in V0 (no charge tool yet).                                                                |
| `vps-matcher-log`        | `[matcher] findServices(...) → N match(es)` per query.                                                                                                                    |
| `vps-bridge-log`         | LLM round-trips, useful for understanding ranker choices.                                                                                                                 |

---

## Acceptance for the first run

Minimum success criteria:

1. Producer engages in real dialog (not a monologue).
2. Reaches at least the industrial-design call; an SVG concept sketch
   lands in the dashboard's Concept column AND artifact panel.
3. Producer narrates each step with one-line `demo_announce` calls.
4. No hallucinated tools, methods, or providers.
5. Producer comes back to the inventor in the TUI after each phase's
   completion.

If it reaches Sales without intervention, that's a stretch outcome,
not the bar.

---

## Common things to take notes on

When you observe a divergence from intent, capture in the run-notes
section below:

- What the agent did vs. what the SKILL.md says it should have done.
- Phase names the agent invented (vs. the suggested vocabulary).
- Service queries that returned zero or unexpected matches.
- Tool-call sequences that felt clunky or audience-unfriendly.
- Anything visual (dashboard region, layout, color, density) that
  reads poorly from a few feet back.
- Performance hiccups: any tool call taking >5 sec is worth a
  note.
- Failures, including ones the producer recovered from gracefully.

These notes are the iteration feedstock for the SKILL.md prompt and
for the dashboard polish pass.

---

## Teardown

In order:

1. `vps-tui`: exit TUI normally.
2. `vps-display`: `Ctrl-C`.
3. `laptop-ctl` (services side): `node ./packages/kernel-cli/dist/app.mjs --home ~/.ocap-services daemon stop`.
4. `vps-ctl`: `./packages/service-matcher/scripts/reset-everything.sh --no-build` to purge for the next run, OR leave running if you want to retry against the same matcher.
5. Log tails can be left open; they'll reopen the file when the next run rotates it.

The browser SSH tunnel (`laptop-ctl`) can stay up indefinitely — it's
cheap.

---

## Troubleshooting (will grow)

- **`start-services.sh` fails with "All N registration(s) failed for matcher ..."** — the matcher's LLM bridge can't reach the openclaw gateway, or the gateway returns HTTP 500. The most common cause after a fresh openclaw upgrade is `OPENCLAW_AGENT_MODEL` defaulting to `openclaw`, which no longer maps to a configured agent. Set `OPENCLAW_AGENT_MODEL=openclaw/<agentId>` (e.g., `openclaw/main` — `<agentId>` is the name of a directory under `~/.openclaw/agents/`) and restart the matcher. The underlying gateway error is visible in `~/.ocap/matcher-llm-bridge.log`; the gateway's own logs aren't easy to find.

- **`openclaw plugins install ...` fails with "Failed to pre-redeem matcher URL" / "Remote comms not initialized"** — `~/.openclaw/openclaw.json` carries a stale `plugins.entries.discovery.config.matcherUrl` from a prior session. The plugin's `register()` tries to redeem it at install time, before the matcher daemon and consumer daemon (and remote comms) are up. Unset the stale URL and reinstall:

  ```csh
  openclaw config unset 'plugins.entries.discovery.config.matcherUrl'
  openclaw plugins install -l ~/GitRepos/ocap-kernel/packages/agentmask/openclaw-plugin-discovery
  ```

- **"observerUrl is required" from demo-display** — `$MATCHER_OBSERVER_URL` wasn't exported in `vps-display`'s shell before `yarn workspace @ocap/demo-display start`. Re-export and restart.
- **Marketplace shows duplicate providers** — V0 matcher has no liveness detection. Restart the matcher (step 2) for a clean slate.
- **TUI claims fewer than 10 tools** — `tools.profile` is set, or `tools.allow` is incomplete. Re-run the one-time setup's `openclaw config` lines and `openclaw gateway restart`.
- **Workflow board scrolls horizontally** — known quirk; columns are 8rem minimum, and the cell can be narrower than 8rem × N-columns. Acceptable for V0; revisit in layout polish.
- **Dashboard goes black after the first event** — the bug fixed in `b13a2cc9a`. Confirm VPS is on a recent enough commit and the frontend was rebuilt.

---

## Notes from runs

Reverse-chronological. Each run gets a dated header; bullet anything
worth remembering for the next iteration of the SKILL.md or the
dashboard.

### Run N — <YYYY-MM-DD>

- (placeholder)
