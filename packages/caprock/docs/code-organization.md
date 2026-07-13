# Caprock plugin: code organization

Reference for how `@ocap/caprock` is laid out and how its parts talk to each
other. Descriptive of the current package; for forward-looking design see
[`caprock-pipeline-rewrite-plan.md`](./caprock-pipeline-rewrite-plan.md).

## What it is

A Claude Code plugin (`@ocap/caprock`, private) that intercepts every Claude
tool invocation via hooks, routes the structured invocation through a
sheaf-backed permission vat running inside ocap-kernel, and returns
allow/ask/deny. Per-session state and an append-only event log live in
`~/.caprock/`.

## Top-level layout

```
packages/caprock/
├── .claude-plugin/plugin.json   ← Claude Code plugin manifest (name, version)
├── hooks/hooks.json             ← one entry per hook event, all → bin/hook.mjs
├── package.json                 ← name=@ocap/caprock; ships dist/ + vat/ + hooks/ + skills/
├── bin/                         ← CLI entrypoints (compiled to dist/bin/*.mjs)
├── src/                         ← library code (compiled to dist/index.mjs)
├── vat/                         ← in-kernel vat code (bundled to .bundle, committed)
├── scripts/                     ← thin shell wrappers around bin/ for user-facing CLIs
├── skills/{audit,setup,status}/SKILL.md  ← slash-command surfaces
└── docs/                        ← this file, and the rewrite plan
```

## The three layers

### 1. Hook layer — `bin/`

Single entrypoint `hook.ts` wired to every Claude hook event by
`hooks/hooks.json`. Reads JSON payload from stdin, dispatches to one of:
`onSessionStart`, `onPreToolUse`, `onPostToolUse`, `onPermissionRequest`, etc.

Per-event responsibilities:

- **SessionStart** — boot session: `ensureDaemon()`, `launchPermissionVat()`,
  `createKernelSession()`, persist `SessionState`.
- **PreToolUse** — `buildClauses(tool_name, tool_input)` → for Bash,
  `decompose()` from `src/bash.ts`; for other tools, wrap as one clause. Route
  each clause via `vatRoute()`. If allow → continue; else → `authorizeRequest()`
  (kernel surfaces a TUI prompt).
- **PostToolUse / PermissionDenied / FileChanged** — record events, refresh
  provisioned list.
- **SessionEnd** — write summary, tear down kernel session.

Other `bin/` tools:

- `setup.ts` — installer health checks (tree-sitter native binding, kernel
  daemon).
- `status.ts` — pretty-print current session state.
- `audit.ts` — replay a transcript against current rules; the only file with
  regex (used to match Claude Code permission _globs_, not bash syntax).
- `harden-shim.ts` — minimal shim because `@endo` lockdown is incompatible with
  the native tree-sitter binding.

### 2. RPC / state layer — `src/`

Library code consumed by `bin/` (and exported via `src/index.ts` for
embedding).

- **`bash.ts`** — the AST core. `decompose(source) → DecomposeResult` parses
  with tree-sitter-bash, dispatches via `SAFETY_FRAGMENT` (a table of
  recognized AST node kinds → handler), returns clauses or refuses with a
  named `DropReason`. Plus security checks (`hasCurlPipeShell`,
  `hasEvalDynamic`). This is the single entry point for bash understanding in
  the whole package.
- **`rpc.ts`** — minimal JSON-RPC client over the kernel's UNIX socket (no
  `@endo` deps — keeps the hook small and lockdown-free). Exports
  `sendCommand`, `createKernelSession`, `authorizeRequest`,
  `recordProvisioned`. The kernel side is the ocap-kernel daemon.
- **`session.ts`** — pure persistence: load/save `SessionState`, append events
  to `<session-id>.jsonl`, read settings allow/deny lists from
  `.claude/settings.json`.
- **`transcript.ts`** — parse Claude Code transcript JSONL (used by audit).
- **`types.ts`** — `SessionState`, `CaprockEvent` / `CaprockEventKind`, hook
  payload types (`PreToolUsePayload`, etc.).
- **`paths/`** — three small modules resolving filesystem locations: `user.ts`
  (HOME), `plugin.ts` (plugin install root), `ocap-kernel.ts` (caprock data
  dir, kernel binary path).
- **`index.ts`** — three re-exports (`types`, `session`, `rpc`). Tiny.

### 3. In-vat layer — `vat/`

`permission-tracker.ts` (plus the committed `.bundle` artifact). This is the
part that _runs inside the kernel_, not in the hook process.

- Built into a vat bundle by `yarn build` (the build script also bundles).
- Per Claude session, the hook launches one of these vats. It maintains a
  sheaf of `Provider<Meta>` capabilities — one per `Provision` (a permission
  grant).
- Methods: `route(tool, invocations)` (the dispatch), `addSection(provision)`
  (grant), `findMatch`, `listProvisions`, `size`.
- Uses `@metamask/sheaves` (`sheafify`, `leastAuthority`, `makeHandler`) — the
  actual sheaf machinery lives there, this is just the per-permission
  encoding.
- Uses `@metamask/kernel-utils/session` for `computeAuthority`, `matchPattern`,
  `matchProvision`, the `Provision` type — the shared parser/authority model.
  This package only provides the _vat-side_ of it.

## Communication boundaries

```
Claude Code                       ocap-kernel daemon
─────────────                     ──────────────────
fires hook
  ↓
bin/hook.ts (subprocess)
  uses src/bash.ts ───────┐         each session →
  uses src/session.ts     │      ┌──────────────────────┐
  uses src/rpc.ts ───── UNIX socket → permission-tracker vat
  writes ~/.caprock/      │      │  (vat/permission-tracker.ts)
  reads ~/.claude/        │      │  sheaf of Provisions
                          │      └──────────────────────┘
returns allow/ask/deny ◄──┘
```

The hook process is short-lived, runs once per event, holds no shared state.
All durable state is either on disk (`~/.caprock/`) or in the kernel daemon's
vat. The hook never imports anything from `vat/` directly — the only contact
is via JSON-RPC over the socket.

## The bash layer's primacy

Bash understanding is funneled through `src/bash.ts` from a single entry point
(`decompose()`), gated by a positive `SAFETY_FRAGMENT` so unknown AST shapes
refuse with `unsupported_construct` rather than fall through to a permissive
walk. Extending the recognized set is a one-line `SAFETY_FRAGMENT` entry plus
tests — a deliberate decision per AST node kind, not an accident of "it
happened to parse." This is the foundation the planned rewriter (per-stage
`caprock` wrapping, per
[`caprock-pipeline-rewrite-plan.md`](./caprock-pipeline-rewrite-plan.md)) will
sit on top of.

## Skills + scripts (user-facing CLIs)

`skills/{audit,setup,status}/SKILL.md` are Claude slash-command definitions.
Each delegates to a thin shell wrapper in `scripts/` (e.g., `scripts/status.sh`
→ `node dist/bin/status.mjs`). The split lets the underlying TS get
type-checked and bundled while the surface remains shell-callable.

## What lives _outside_ this package

Worth knowing where the boundaries are:

- The sheaf algebra (`sheafify`, `leastAuthority`, sections, lifts) —
  `@metamask/sheaves`.
- The `Provision` data model, `computeAuthority`, pattern matching —
  `@metamask/kernel-utils/session`.
- The kernel daemon, vat lifecycle, TUI prompting — the broader ocap-kernel.
- Tree-sitter parser — `tree-sitter` + `tree-sitter-bash` (native bindings;
  needs the `harden-shim` workaround).

Caprock itself is mostly _glue and policy_: parse the bash, plumb the RPC,
persist the session, and host one specific vat that encodes "this permission
grant means this routing rule."
