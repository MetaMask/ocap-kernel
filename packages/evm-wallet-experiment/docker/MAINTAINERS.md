# Docker stack — maintainer notes

Local E2E stack for `@ocap/evm-wallet-experiment`: Anvil + deployed contracts, Pimlico Alto, and six kernel containers (three `kernel-home-*` / `kernel-away-*` pairs). See `package.json` scripts (`docker:compose`, `test:e2e:docker`, etc.). Each pair is gated by a Compose **profile** (**`7702`**, **`4337`**, **`relay`**); **`yarn docker:up`** / **`docker:compose`** pass **all three** so Vitest Docker E2E and full-stack dev see every kernel. **`yarn docker:demo:up`** enables **one** profile (default **`bundler-7702`** delegation mode → profile **`7702`**). Shared kernel **build / volumes / entrypoint / depends_on** live in root **`x-kernel-standard`**; **`x-kernel-build-core`** holds **`context`** / **`dockerfile`** so **`kernel-away-bundler-7702`** can set **`build.target`** from **`${KERNEL_AWAY_7702_TARGET:-kernel}`**. Per-pair **ports**, **`environment`**, and **`healthcheck.test`** stay explicit.

## Startup order

Compose encodes this dependency chain:

1. **`evm`** becomes healthy when `/run/ocap/contracts.json` exists (written only after `deploy-contracts.mjs` finishes). **`entrypoint-evm.sh`** removes a previous **`contracts.json`** on the shared volume first so a stale file does not satisfy the healthcheck while Anvil is redeploying (bundler would otherwise start with dead EntryPoint addresses and exit).
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

### OpenClaw (demo image only)

`Dockerfile.kernel-base` installs a **fixed** global CLI version (`openclaw@…`). The gateway loads **`openclaw-plugin/index.ts`** via **jiti**; nothing in the image invokes `tsx`. Bump OpenClaw deliberately when you want new gateway behavior; avoid `@latest` here.

Host-side scripts (e.g. `yarn docker:setup:wallets`) use the workspace **`tsx`** devDependency on your machine, not the container.

### EVM deploy image (`Dockerfile.evm`)

`viem` and `@metamask/smart-accounts-kit` are installed with **exact versions** that should match **`yarn.lock`** for `@ocap/evm-wallet-experiment`. When you bump those dependencies in the workspace, update the `npm install …@version` line in `Dockerfile.evm` in the same change (or CI/docker builds may diverge from monorepo behavior). Do not pipe **`npm install`** through **`tail`** (or other pipeline tails): **`sh`** uses the last command’s exit status, which would hide install failures.

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

## Docker Model Runner + Compose `models` (base `docker-compose.yml`)

- **`yarn docker:up`** and **`yarn test:e2e:docker`** expect the full stack, including [**Compose `models`**](https://docs.docker.com/ai/compose/models-and-compose/) on each **`kernel-away-*`** service. That requires **Docker Compose v2.38+** and [**Docker Model Runner**](https://docs.docker.com/ai/model-runner/) enabled.
- Top-level **`models.llm`** pins **`ai/qwen3.5:4B-UD-Q4_K_XL`** with **`context_size: 32768`** and **`runtime_flags: ['--ctx-size','32768']`** so llama.cpp does not stay at DMR’s 4096 default (OpenClaw + tools need more). Pull if needed: **`docker model pull ai/qwen3.5:4B-UD-Q4_K_XL`**. If requests still hit 4096, run **`docker model configure --context-size 32768 ai/qwen3.5:4B-UD-Q4_K_XL`** on the host and recreate containers.
- Vitest Docker E2E does **not** call the LLM today, but away containers still receive **`LLM_URL`** / **`LLM_MODEL`** for consistency with the demo OpenClaw stack and future tests.

## Demo stack (`docker/.env.demo` + one pair profile)

- **`yarn docker:compose:demo`** runs **`node docker/run-demo-compose.mjs`**, which passes **`--env-file docker/.env.demo`** ( **`KERNEL_AWAY_7702_TARGET=demo`** for the 7702 away image) and **one** **`--profile`** (**`7702`**, **`4337`**, or **`relay`**). Default delegation mode is **`bundler-7702`** → profile **`7702`** (same mode strings as Docker E2E **`DELEGATION_MODE`**).
- **Choose the pair**: set **`OCAP_DEMO_PAIR`** to **`bundler-7702`**, **`bundler-hybrid`**, or **`peer-relay`**, or pass **`--pair <value>`** before compose subcommands (after **`yarn … --`** if needed), e.g. **`yarn docker:demo:up -- --pair bundler-hybrid`**.
- **`yarn docker:demo:setup`** runs wallet setup; OpenClaw **`setup-openclaw.mjs`** + gateway run **only** when the pair is **`bundler-7702`** (the image with OpenClaw). Other pairs skip those steps with a short log line.
- OpenClaw UI history for 7702 lives under **`$HOME/.openclaw`** on the **`ocap-run`** volume; use **`yarn docker:demo:reset-openclaw`** then **`yarn docker:demo:setup`**, or **`docker compose … down -v`** for a full volume wipe. LLM wiring is **only** in **`docker-compose.yml`** (**`models:`**).

**Raw `docker compose -f docker/docker-compose.yml up`** without **`--profile`** starts **evm** and **bundler** only (no kernels). Prefer **`yarn docker:up`** or the demo scripts above.

## `yarn docker:delegate`

Runs **`create-delegation.mjs`** inside **`kernel-home-bundler-7702`**. It reads **`/run/ocap/docker-delegation-home.json`** and **`docker-delegation-away.json`** (coordinator **`kref`**, daemon **`socketPath`**, delegate addresses) written by **`yarn docker:setup:wallets`** on the shared **`ocap-run`** volume. Run wallet setup first for the delegation mode / pair you use.

## Ports and conflicts

Published TCP ports include **8545** (Anvil), **4337** (bundler). Kernels publish **UDP 4011–4032** (QUIC, three pairs). Use alternate mappings if these clash with other stacks.
