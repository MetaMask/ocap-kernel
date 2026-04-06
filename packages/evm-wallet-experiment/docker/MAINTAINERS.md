# Docker stack — maintainer notes

Local E2E stack for `@ocap/evm-wallet-experiment`: Anvil + deployed contracts, Pimlico Alto, and six kernel containers (three `kernel-home-*` / `kernel-away-*` pairs). See `package.json` scripts (`docker:compose`, `test:e2e:docker`, etc.).

## Startup order

Compose encodes this dependency chain:

1. **`evm`** becomes healthy when `/run/ocap/contracts.json` exists (written only after `deploy-contracts.mjs` finishes).
2. **`bundler`** waits on that file, reads `EntryPoint`, then starts Alto.
3. **Kernel services** wait on **both** `evm` and **`bundler` healthy** so wallet setup does not race Alto boot.

If you add a service that kernels need before they are ready, extend `depends_on` and healthchecks accordingly.

## Pinned images and versions

### Alto (bundler)

The bundler image uses a **multi-arch OCI index digest**, not `:latest`, so CI and local builds stay aligned.

To **upgrade Alto**:

```sh
docker buildx imagetools inspect ghcr.io/pimlicolabs/alto:latest
```

Copy the top-level **Digest** (index), then set in `docker-compose.yml`:

`image: ghcr.io/pimlicolabs/alto@sha256:<digest>`

Keep the comment above that line in sync with the command you used.

### OpenClaw (interactive image only)

`Dockerfile.kernel-base` installs a **fixed** global CLI version (`openclaw@…`). The gateway loads **`openclaw-plugin/index.ts`** via **jiti**; nothing in the image invokes `tsx`. Bump OpenClaw deliberately when you want new gateway behavior; avoid `@latest` here.

Host-side scripts (e.g. `yarn docker:setup:wallets`) use the workspace **`tsx`** devDependency on your machine, not the container.

### EVM deploy image (`Dockerfile.evm`)

`viem` and `@metamask/smart-accounts-kit` are installed with **exact versions** that should match **`yarn.lock`** for `@ocap/evm-wallet-experiment`. When you bump those dependencies in the workspace, update the `npm install …@version` line in `Dockerfile.evm` in the same change (or CI/docker builds may diverge from monorepo behavior).

### Foundry base (`Dockerfile.evm`)

`foundry:latest` is still a floating tag. If Anvil/cast behavior breaks the stack, consider pinning that image by digest the same way as Alto.

## Healthchecks

- **`evm`**: File-based (`contracts.json`). The image itself does not define `HEALTHCHECK`; Compose is the source of truth.
- **`bundler`**: JSON-RPC `eth_supportedEntryPoints` must return a **non-empty** array. If Alto changes RPC surface, adjust the probe in `docker-compose.yml`.

## Kernel image build (`Dockerfile.kernel-base`)

- Postinstall scripts are stripped workspace-wide so `yarn install` succeeds in Docker; **native addons are rebuilt explicitly** afterward.
- **`node-datachannel`** and **`better-sqlite3`** rebuilds **must succeed**; the Dockerfile does not swallow failures. If the image fails to build, fix the toolchain (compilers, libc) rather than reintroducing `|| true`.

## Security (local dev only)

`docker-compose.yml` embeds **well-known Anvil private keys** for Alto. That is intentional for an isolated local chain. **Do not reuse this pattern** for any network that is exposed or shared.

## Interactive stack (`docker-compose.interactive.yml`)

- Requires **Docker Compose v2.38+** and [**Docker Model Runner**](https://docs.docker.com/ai/model-runner/) enabled.
- Merges over **`kernel-away-bundler-7702`**: **`interactive`** image target (OpenClaw) and Compose [**`models`**](https://docs.docker.com/ai/compose/models-and-compose/) binding **`llm`** → **`ai/qwen3.5:4B-UD-Q4_K_XL`** with **`context_size: 32768`** (DMR’s default 4096 is too small for OpenClaw + tool prompts). Larger context uses more RAM.
- Run **`yarn docker:compose:interactive`**. Pull the model first if needed: **`docker model pull ai/qwen3.5:4B-UD-Q4_K_XL`**.
- **`compose.interactive.yml`** sets **`context_size`** and **`runtime_flags: ['--ctx-size','32768']`** so llama.cpp does not stay at the 4096 default. If requests still fail with 4096, run on the host: **`docker model configure --context-size 32768 ai/qwen3.5:4B-UD-Q4_K_XL`**, then recreate the stack.
- OpenClaw UI history lives under **`$HOME/.openclaw`** in the away container (on the **`ocap-run`** named volume). Rebuilding images does **not** clear it. Use **`yarn docker:interactive:reset-openclaw`**, then **`yarn docker:interactive:setup`**, or **`docker compose … down -v`** (wipes **all** kernel/contract state on that volume — use with care).

## Optional **`ollama`** profile

- Service **`ollama`** uses profile **`ollama`** for an in-stack Ollama server. Interactive OpenClaw uses **DMR via Compose `models`**, not this service, unless you change the stack.

## Ports and conflicts

Published TCP ports include **8545** (Anvil), **4337** (bundler). Kernels publish **UDP 4011–4032** (QUIC, three pairs). The **`ollama`** profile does not publish **11434** to the host by default in the current compose file; check `docker-compose.yml` if that changes. Use alternate mappings if these clash with other stacks.
