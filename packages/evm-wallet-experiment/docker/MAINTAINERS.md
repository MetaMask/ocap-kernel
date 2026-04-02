# Docker stack — maintainer notes

Local E2E stack for `@ocap/evm-wallet-experiment`: Anvil + deployed contracts, Pimlico Alto, and two kernel containers (`home`, `away`). See `package.json` scripts (`docker:compose`, `test:e2e:docker`, etc.).

## Startup order

Compose encodes this dependency chain:

1. **`evm`** becomes healthy when `/run/ocap/contracts.json` exists (written only after `deploy-contracts.mjs` finishes).
2. **`bundler`** waits on that file, reads `EntryPoint`, then starts Alto.
3. **`home` and `away`** wait on **both** `evm` and **`bundler` healthy** so wallet setup does not race Alto boot.

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
- **`llm`**: HTTP GET `/` on the proxy; **5xx** (e.g. upstream unreachable) marks the service unhealthy.

## Kernel image build (`Dockerfile.kernel-base`)

- Postinstall scripts are stripped workspace-wide so `yarn install` succeeds in Docker; **native addons are rebuilt explicitly** afterward.
- **`node-datachannel`** and **`better-sqlite3`** rebuilds **must succeed**; the Dockerfile does not swallow failures. If the image fails to build, fix the toolchain (compilers, libc) rather than reintroducing `|| true`.

## Security (local dev only)

`docker-compose.yml` embeds **well-known Anvil private keys** for Alto. That is intentional for an isolated local chain. **Do not reuse this pattern** for any network that is exposed or shared.

## Interactive profile

- **`llm`** defaults `LLM_UPSTREAM` to `http://host.docker.internal:8080`. On **Linux**, `host.docker.internal` may be missing unless you add `extra_hosts` or another reachability strategy; document any project-standard workaround here when you add one.
- **`docker-compose.interactive.yml`** overrides `away` (OpenClaw + LLM). Ensure the **`interactive`** profile is used when you expect those services.

## Ports and conflicts

Published ports include **8545**, **4337**, **11434** (profile), and **UDP 4001/4002**. They can clash with other stacks on the host; use Compose [profiles](https://docs.docker.com/compose/profiles/) or alternate port mappings if needed.
