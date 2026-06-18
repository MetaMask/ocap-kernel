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
producer LLM primarily by typing into the dashboard's
Producer-dialog iframe, which is a ttyd-fronted view of an
`openclaw tui` session running on the VPS. An SSH-attached
`openclaw tui` on the VPS shares the same named session as a
fallback / setup terminal.

```
                        ┌──── VPS ────┐
   ssh sessions  ◀────▶ │  relay      │
                        │  matcher    │
                        │  consumer   │
                        │  demo-display│
                        │  openclaw   │
                        │  ttyd       │ ◀── iframe src
                        └─────────────┘
                              ▲
                              │ relay
                              ▼
                        ┌─── Laptop ──┐
                        │  sample-svcs│
                        │  browser    │ ◀── dashboard (+ embedded TUI)
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

| Label              | Machine | Purpose                                                                                                                        |
| ------------------ | ------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `vps-relay`        | VPS     | `yarn ocap relay`. Idles after startup.                                                                                        |
| `vps-matcher-log`  | VPS     | `tail -F ~/.ocap/daemon.log`.                                                                                                  |
| `vps-bridge-log`   | VPS     | `tail -F ~/.ocap/matcher-llm-bridge.log`.                                                                                      |
| `vps-consumer-log` | VPS     | `tail -F ~/.ocap-consumer/daemon.log`.                                                                                         |
| `vps-display`      | VPS     | `yarn workspace @ocap/demo-display start`. Hosts the long-running HTTP+SSE server.                                             |
| `vps-ttyd`         | VPS     | `ttyd -p 7681 -W openclaw tui --session demo`. Fronts the producer TUI for the iframe in the dashboard's Producer-dialog pane. |
| `laptop-svcs-log`  | Laptop  | `tail -F ~/.ocap-services/daemon.log`.                                                                                         |

### Large windows (interactive, in-depth)

| Label            | Machine       | Purpose                                                                                                                                                                                                                                        |
| ---------------- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `vps-tui`        | VPS (via ssh) | `openclaw tui --session demo`. Retained as a setup terminal (for `openclaw skills install --force`, `openclaw plugins`, etc.) and as a fallback if the dashboard iframe acts up; during the demo the inventor types into the iframe, not here. |
| `vps-ctl`        | VPS           | Catch-all VPS control terminal: `start-matcher.sh`, ad-hoc `ocap daemon exec ...`, file edits, ssh from this window for the others.                                                                                                            |
| `laptop-ctl`     | Laptop        | Catch-all laptop control: `start-services.sh`, ad-hoc `curl http://127.0.0.1:7777/...`, git operations, file edits.                                                                                                                            |
| `laptop-browser` | Laptop        | Not a terminal — the browser window showing `http://127.0.0.1:7777/` via SSH tunnel.                                                                                                                                                           |

### Window arrangement (suggested)

Position so the audience can see at a glance:

- **`laptop-browser`** dominant on the screen — the dashboard is the
  show, and now embeds the producer TUI as its bottom-right pane.
- The six log windows (including `vps-ttyd`) tiled in a side strip —
  for the presenter to glance at during the run; the audience
  doesn't need to read them.
- `vps-tui`, `vps-ctl`, and `laptop-ctl` minimized until needed.

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

Install `ttyd` (fronts the openclaw TUI for the dashboard's
Producer-dialog iframe — see step 5b). Package name is `ttyd` on
most distros:

```csh
sudo apt install ttyd
which ttyd
```

The Debian/Ubuntu package ships a systemd unit that auto-starts a
`ttyd login` service on port 7681 at boot. This both squats the port
we need for step 5b (so per-run `ttyd ...` invocations fail with
`EADDRINUSE` / `lws_socket_bind ... (-1 98)`) and exposes a
web-accessible login prompt — neither of which we want. Stop and
disable it:

```csh
sudo systemctl stop ttyd
sudo systemctl disable ttyd
```

`disable` persists across reboots, so this is a one-time fix.

Remove any pre-existing matcher URL from openclaw's config (safe on
a fresh system; per-run setup sets a fresh URL in step 5):

```csh
openclaw config unset 'plugins.entries.discovery.config.matcherUrl'
```

Install the openclaw plugins:

```csh
openclaw plugins install -l \
  ~/GitRepos/ocap-kernel/packages/agentmask/openclaw-plugin-discovery
openclaw plugins install -l \
  ~/GitRepos/ocap-kernel/packages/agentmask/openclaw-plugin-demo
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
openclaw config set plugins.allow \
  '["discovery", "demo", "anthropic", "google", "memory-core"]'
```

`tools.allow` must include the twelve tool names below. If any are
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
demo_wallet_charge
read
```

`read` is openclaw's built-in file-reading tool; the
`/product-orchestration` slash command in step 8 works by telling
the agent to read the skill file, so without `read` in the allowlist
the skill body never reaches the model and the agent operates on the
skill description alone (which is sycophantic and ignores the hard
rules).

Set the remaining flags (these are safe to set unconditionally):

```csh
openclaw config unset tools.profile
openclaw plugins disable metamask
openclaw config set gateway.http.endpoints.chatCompletions.enabled true
```

Install the two skills the demo uses. Plugin-bundled skills are
NOT auto-discovered; they require an explicit `openclaw skills
install`. The path argument must start with `./` — absolute paths
get misclassified as slugs. Use `--force` because a previous
install of the same slug blocks the re-install otherwise:

```csh
cd ~/GitRepos/ocap-kernel
openclaw skills install --force \
  ./packages/agentmask/openclaw-plugin-discovery/skills/discovery
openclaw skills install --force \
  ./packages/agentmask/openclaw-plugin-demo/skills/product-orchestration
```

`--force` is what makes a re-install overwrite the workspace copy
in place; no need to manually remove the previous version first.

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

Both `discovery` and `product-orchestration` should appear.

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

Set `VPS_HOST` in the laptop shell profile so the per-run steps can
reference it without re-typing the hostname. Use whatever value you
already pass to `ssh` (an alias from `~/.ssh/config`, `user@host`, or
a bare hostname):

```csh
setenv VPS_HOST <vps-ssh-target>
```

This is the only place `<vps-ssh-target>` appears in the playbook;
every later step interpolates `$VPS_HOST`.

---

## Code-update setup

Do this between rehearsals when code has changed on
`chip/orchestration-demo` since the last run. Sits between the
one-time setup (per machine, once) and the per-run sequence
(restart services for a rehearsal). Skip the whole section if
nothing's changed since the last run.

The laptop is the source of truth — code edits, commits, and
rebuilds happen there. GitHub is just the relay that hands the
commits to the VPS. So:

- **Laptop**: do not pull. The local working tree already has
  whatever's about to be tested. Rebuild the affected workspaces
  if they're consumed by anything you'll restart in the per-run
  sequence (see the table below).
- **VPS**: pull from GitHub, then run the matching sub-steps.

### VPS — pull

```csh
cd ~/GitRepos/ocap-kernel
git pull
yarn install
```

`yarn install` is a no-op when no package.json changed; safe to
run unconditionally.

### Pick which sub-steps apply (both machines)

Look at `git diff --stat HEAD@{1} HEAD` (on the VPS) or
`git log --stat -1` (on the laptop, against whatever you most
recently committed) and run the sub-steps that match the changed
paths. Anything not listed is covered by the per-run sequence —
typically `start-services.sh`, `reset-everything.sh`, and the
gateway restart pick up source changes through their own
rebuilds.

| If this changed                                                                 | Run, before `## Per-run setup sequence`                                                                                                                                                           |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/agentmask/openclaw-plugin-demo/skills/product-orchestration/SKILL.md` | (VPS) `openclaw skills install --force ./packages/agentmask/openclaw-plugin-demo/skills/product-orchestration`                                                                                    |
| `packages/agentmask/openclaw-plugin-discovery/skills/discovery/SKILL.md`        | (VPS) `openclaw skills install --force ./packages/agentmask/openclaw-plugin-discovery/skills/discovery`                                                                                           |
| `packages/agentmask/openclaw-plugin-{demo,discovery}/openclaw.plugin.json`      | (VPS) `openclaw gateway restart` — per-run step 6 handles this anyway, but if you're testing the manifest change in isolation, force a restart now                                                |
| `packages/demo-display/**`                                                      | (VPS) `yarn workspace @ocap/demo-display build` — per-run step 5 re-launches the server which serves the new build                                                                                |
| `packages/sample-services/**`                                                   | (Laptop) nothing — `start-services.sh` rebuilds + re-bundles + re-registers in per-run step 7                                                                                                     |
| `packages/service-matcher/**` or `packages/llm-bridge/**`                       | (VPS) `yarn workspace @ocap/service-matcher build && yarn workspace @ocap/service-matcher bundle-vat && yarn workspace @ocap/llm-bridge build` — per-run step 4 then picks up the new bundles     |
| `packages/kernel-cli/**`                                                        | (VPS) `yarn workspace @metamask/kernel-cli build`. (Laptop) only if you haven't already built it from this commit — used by `start-services.sh`. The matcher restart and sample-services pick up. |
| `docs/orchestration-demo-dry-run.md`                                            | nothing — re-read it                                                                                                                                                                              |

### Tools.allow updates

If the demo plugin's `contracts.tools` list has gained or lost a
tool, mirror that in `tools.allow` on the VPS and restart the
gateway:

```csh
openclaw config get tools.allow
openclaw config set tools.allow '["...existing entries...","new_tool_name"]'
openclaw gateway restart
```

---

## Per-run setup sequence

Order matters — each step's terminal stays running for the
duration of the run. The sequence is split into two phases:

- **Long-running setup (steps 1-3)** — establishes the relay, the
  log tails, and the browser tunnel. Once running, these stay up
  across multiple rehearsals; you only revisit them if something
  crashes or you reboot.
- **Per-rehearsal setup (steps 4-9)** — these get redone (or
  restarted in order) at the start of every rehearsal so the
  matcher, the dashboard, the openclaw gateway, the
  sample-services daemon, and the TUI session all start from a
  known clean state.

### Step 1: VPS relay

In `vps-relay`:

```csh
yarn ocap relay
```

Leave it. The relay writes `~/.libp2p-relay/relay.addr`.

### Step 2: VPS log tails

Open `vps-matcher-log`, `vps-bridge-log`, `vps-consumer-log` and
start tailing (one command per window — `tail -F` waits patiently
when the file doesn't exist yet, so these can start before the
matcher does):

```csh
tail -F ~/.ocap/daemon.log
tail -F ~/.ocap/matcher-llm-bridge.log
tail -F ~/.ocap-consumer/daemon.log
```

### Step 3: Browser tunnel + load dashboard

From `laptop-ctl`:

```csh
ssh -L 7777:127.0.0.1:7777 $VPS_HOST
```

Leave that session open. In `laptop-browser`, open
`http://127.0.0.1:7777/`. The page will sit with a connection error
until step 5 (demo-display) is up; the browser auto-recovers once
the server is listening.

### Step 4: VPS matcher + consumer daemon

In `vps-ctl`:

```csh
./packages/service-matcher/scripts/reset-everything.sh --no-build
source ~/.ocap/matcher-urls.env
```

`start-matcher.sh` (invoked by `reset-everything.sh`) writes the
minted URLs to `~/.ocap/matcher-urls.env` as csh `setenv` lines, so
sourcing the file is all that's needed to pick them up. Every later
step that wants `MATCHER_OCAP_URL` or `MATCHER_OBSERVER_URL` sources
this same file.

### Step 5: VPS demo-display server

In `vps-display`:

```csh
env DEMO_DISPLAY_TTYD_URL="http://${VPS_HOST}:7681" \
    yarn workspace @ocap/demo-display start
```

`DEMO_DISPLAY_TTYD_URL` points the dashboard's Producer-dialog pane
at the ttyd server started in step 5b. Adjust to whatever address
your laptop can reach (substitute `${VPS_HOST}` if the variable
isn't already in your environment, or use the public hostname /
ssh-tunneled localhost if that's how you're reaching the VPS).

(Earlier versions of demo-display needed `OCAP_HOME` and a
`source ~/.ocap/matcher-urls.env` for an observer-URL redemption
that drove a periodic `listAll` poll. The dashboard now populates
its services map directly from `service.discovered` events posted
by the openclaw discovery plugin, so none of that matcher-side
plumbing is required.)

Watch for:

```
[demo-display] Redeemed observer URL; kref=k...
[demo-display] Listening on http://127.0.0.1:7777/events
```

The browser tab from step 3 should now connect and show the empty
dashboard: services grid empty, workflow board empty, transcript
empty, producer-dialog pane connecting to the ttyd iframe (will
populate once step 5b is up), wallet ribbon `—`.

### Step 5b: VPS ttyd (producer-dialog iframe source)

In `vps-ttyd`:

```csh
ttyd -p 7681 -W openclaw tui --session demo
```

ttyd listens on port 7681 and spawns an `openclaw tui` attached to
the named `demo` session for each WebSocket client (i.e. each load
of the dashboard iframe). The named session means a page refresh
restarts the iframe's terminal but reattaches to the same
conversation. `vps-tui` (step 8) uses the same `--session demo` so
the SSH-attached TUI and the iframe both show the same dialog.

Make sure port 7681 is reachable from the laptop browser. If you're
using an SSH tunnel for the dashboard (`-L 7777:127.0.0.1:7777`),
add `-L 7681:127.0.0.1:7681` to the same tunnel command and point
`DEMO_DISPLAY_TTYD_URL` at `http://127.0.0.1:7681`.

### Step 6: Configure the discovery plugin

In `vps-ctl`:

```csh
source ~/.ocap/matcher-urls.env
openclaw config set 'plugins.entries.discovery.config.ocapHome' \
  "$HOME/.ocap-consumer"
openclaw config set 'plugins.entries.discovery.config.ocapCliPath' \
  "$HOME/GitRepos/ocap-kernel/packages/kernel-cli/dist/app.mjs"
openclaw config set 'plugins.entries.discovery.config.matcherUrl' \
  "$MATCHER_OCAP_URL"
openclaw config set 'plugins.entries.discovery.config.displayUrl' \
  'http://127.0.0.1:7777'
openclaw gateway restart
```

### Step 7: Laptop sample-services daemon

In `laptop-ctl` (a different session from the SSH tunnel — that one
is occupied), pull the current matcher URLs and relay address from
the VPS:

```csh
scp ${VPS_HOST}:.ocap/matcher-urls.env /tmp/matcher-urls.env
source /tmp/matcher-urls.env
setenv OCAP_RELAY_MULTIADDR `ssh $VPS_HOST cat \~/.libp2p-relay/relay.addr`
./packages/sample-services/scripts/start-services.sh
```

Watch for ten `info "<svc> registered."` lines (echo,
random-number, industrial-design, schematic-generation, firmware,
mechanical-design, pcb-layout, component-sourcing, device-assembly,
retail-listing).

In `laptop-svcs-log`:

```csh
tail -F ~/.ocap-services/daemon.log
```

The dashboard's marketplace grid stays empty at this point — the
matcher knows about ten providers, but the conceit is that the
audience side only learns about them when the agent discovers them
via the matcher. Cards will appear during the demo as the agent runs
`discovery_find_services`.

### Step 8: OpenClaw TUI

In `vps-tui` (an ssh session into the VPS):

```csh
openclaw tui --session demo
```

`--session demo` attaches to the same named session ttyd is fronting
in step 5b, so this SSH-attached TUI and the dashboard iframe both
show the same conversation. Either one can drive the dialog.

Once the TUI is up, load the product-orchestration skill into the
agent's context by invoking the slash command:

> `/product-orchestration`

Openclaw will autocomplete the command name after the first few
characters. The agent reads the SKILL.md file using its `read` tool
(which is why `read` must be in `tools.allow` — see one-time setup);
after the load completes you should see a brief acknowledgement like
_"Loaded. I'm in producer mode…"_. If instead the agent says it
can't read files / asks you to paste the SKILL.md content, `read`
isn't in the allowlist.

Optional sanity check the agent's context (in plain prose):

> "What is the first item in the 'Hard rules' section of the
> product-orchestration skill? Quote it exactly."

The reply should begin with _"Never generate artifacts yourself."_
If the agent paraphrases or asks for the file contents, the body
didn't load.

### Step 9: Begin the demo

Click into the dashboard's Producer-dialog iframe to give it focus,
then pitch the LAUR concept:

> "I have an idea for a less annoying universal remote — simpler
> than the ones out there, easier to use. Help me get it made."

From here you're the inventor. The producer takes over. (You can
type into `vps-tui` instead if the iframe is acting up; the
`--session demo` named session means both windows are looking at
the same conversation.)

---

## Restarting the matcher mid-run

`reset-everything.sh` cold-starts the matcher and mints **fresh**
`MATCHER_OCAP_URL` and `MATCHER_OBSERVER_URL` values, then rewrites
`~/.ocap/matcher-urls.env`. Anything that captured one of those URLs
at startup needs to be refreshed. After re-running step 4, in order:

1. **Re-source the env file** in every shell that still has the
   stale URLs in its environment: `source ~/.ocap/matcher-urls.env`
   in `vps-ctl`.
2. **Restart `vps-display`** (Ctrl-C, then re-run step 5 — its
   `source` picks up the new URL from the regenerated file).
3. **Redo step 6**: point the discovery plugin's `matcherUrl` at
   the new URL (`source` first) and restart the gateway.
4. **Redo step 7** on the laptop: re-`scp` the env file from the
   VPS, source it, re-run `start-services.sh`.

The long-running steps (relay, log tails, SSH tunnel — steps 1, 2,
and 3) keep working without changes.

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
  openclaw plugins install -l \
    ~/GitRepos/ocap-kernel/packages/agentmask/openclaw-plugin-discovery
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
