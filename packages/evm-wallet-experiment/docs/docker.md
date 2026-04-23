# Docker Compose Setup

Reference for the Docker Compose stack used by both the [local demo](./demo-local.md) and the automated Docker E2E tests.

---

## Prerequisites

- **Docker** with Compose v2.38+
- **Node.js 22** and **Yarn** (for host-side setup commands)
- **Docker Model Runner** with `ai/qwen3.5:4B-UD-Q4_K_XL` pulled — required for the OpenClaw AI agent on the `bundler-7702` demo pair

  ```bash
  docker model pull ai/qwen3.5:4B-UD-Q4_K_XL
  ```

---

## Building

```bash
# Build all container images
yarn workspace @ocap/evm-wallet-experiment docker:build

# Force a clean rebuild (no layer cache)
yarn workspace @ocap/evm-wallet-experiment docker:build:force
```

The away kernel for `bundler-7702` has two Dockerfile targets:

| Target   | Used by             | Includes                     |
| -------- | ------------------- | ---------------------------- |
| `kernel` | E2E tests (default) | Kernel daemon only           |
| `demo`   | Demo mode           | Kernel daemon + OpenClaw CLI |

The `demo` target is activated automatically by `docker:demo:up` via `docker/.env.demo`.

---

## Stack overview

### Services

| Service                      | Image           | Purpose                                                                       |
| ---------------------------- | --------------- | ----------------------------------------------------------------------------- |
| `evm`                        | Anvil (Foundry) | Local EVM chain; deploys Delegation Framework contracts on startup; port 8545 |
| `bundler`                    | Alto            | ERC-4337 bundler pointing at `evm`; port 4337                                 |
| `kernel-home-bundler-7702`   | kernel          | Home kernel, SRP keyring, 7702 smart account; QUIC port 4011                  |
| `kernel-away-bundler-7702`   | kernel / demo   | Away kernel, throwaway keyring; QUIC port 4012                                |
| `kernel-home-bundler-hybrid` | kernel          | Home kernel, hybrid smart account; QUIC port 4021                             |
| `kernel-away-bundler-hybrid` | kernel          | Away kernel; QUIC port 4022                                                   |
| `kernel-home-peer-relay`     | kernel          | Home kernel, 7702 smart account; QUIC port 4031                               |
| `kernel-away-peer-relay`     | kernel          | Away kernel, no bundler (relays to home); QUIC port 4032                      |

### Profiles

Profiles control which home/away pair is started:

| Profile | Pair           | Activated by      |
| ------- | -------------- | ----------------- |
| `7702`  | bundler-7702   | `--profile 7702`  |
| `4337`  | bundler-hybrid | `--profile 4337`  |
| `relay` | peer-relay     | `--profile relay` |

Demo mode activates one profile at a time. E2E test mode (`docker:up`) activates all three simultaneously.

### Volumes

| Volume / path                                       | Mount point | Contents                                                                                                 |
| --------------------------------------------------- | ----------- | -------------------------------------------------------------------------------------------------------- |
| `ocap-run` (named volume)                           | `/run/ocap` | Kernel databases, daemon sockets, contract addresses, delegation context, OpenClaw state                 |
| `packages/evm-wallet-experiment/logs/` (bind-mount) | `/logs`     | Per-service log files (`<service-name>.log`); persists across restarts and readable directly on the host |

The `logs/` directory is created automatically by `docker:up` and `docker:demo:up` via the `docker:ensure-logs` script. Each container's entrypoint tees its stdout/stderr to `/logs/<service-name>.log`.

---

## Docker E2E tests

The automated E2E suite runs all three delegation modes in parallel against a live Docker stack.

```bash
# Start all three pairs (Anvil + bundler + 6 kernel containers)
yarn workspace @ocap/evm-wallet-experiment docker:up

# Run all modes in parallel
yarn workspace @ocap/evm-wallet-experiment test:e2e:docker

# Run a single mode
DELEGATION_MODE=bundler-7702 yarn workspace @ocap/evm-wallet-experiment test:e2e:docker
# DELEGATION_MODE options: bundler-7702, bundler-hybrid, peer-relay

# Tear down
yarn workspace @ocap/evm-wallet-experiment docker:down
```

Each delegation mode runs against a dedicated home/away service pair using a distinct BIP-44 `addressIndex` from the shared Anvil test mnemonic (`test test test ... junk`) to avoid EOA collisions.

| Mode             | Home account                                  | Away redemption path                                  |
| ---------------- | --------------------------------------------- | ----------------------------------------------------- |
| `bundler-7702`   | EIP-7702 stateless smart account (index 0)    | ERC-4337 UserOp via Alto bundler                      |
| `bundler-hybrid` | Hybrid counterfactual smart account (index 1) | ERC-4337 UserOp via Alto bundler                      |
| `peer-relay`     | EIP-7702 stateless smart account (index 2)    | Relayed to home wallet via CapTP (no bundler on away) |

The test suite covers: wallet setup on both kernels, delegation creation and transfer, `sendTransaction` via delegation redemption, on-chain inclusion polling (hybrid mode), `getCapabilities` and `getAccounts` introspection, and peer-relay fallback. The `beforeAll` guard throws a descriptive error if the stack is not running.

---

## Environment variables

| Variable                  | Default                        | Description                                                                                    |
| ------------------------- | ------------------------------ | ---------------------------------------------------------------------------------------------- |
| `OCAP_DEMO_PAIR`          | `bundler-7702`                 | Which home/away pair to start in demo mode; overridden by `--pair` flag                        |
| `DELEGATION_MODE`         | `bundler-7702`                 | Which mode to run in `test:e2e:docker`; also controls delegate resolution in `docker:delegate` |
| `CAVEAT_ETH_LIMIT`        | _(none)_                       | Wei cap on native-token transfers when running `docker:delegate` (default setup uses 1000 ETH) |
| `LLM_URL`                 | _(injected by Compose models)_ | OpenAI-compatible LLM base URL for the OpenClaw gateway                                        |
| `LLM_MODEL`               | `ai/qwen3.5:4B-UD-Q4_K_XL`     | Model ID written to the OpenClaw config                                                        |
| `DEBUG_OCAP_DEMO_COMPOSE` | _(unset)_                      | Print pair and profile resolution details during demo compose operations                       |

---

## Debugging

```bash
# Tail logs from all running services
yarn workspace @ocap/evm-wallet-experiment docker:logs

# Read a per-service log file directly on the host (no docker cp needed)
cat packages/evm-wallet-experiment/logs/kernel-home-bundler-7702.log

# Inspect structured test results after a docker e2e run
cat packages/evm-wallet-experiment/logs/test-results.json

# Check container health
yarn workspace @ocap/evm-wallet-experiment docker:ps
```

Kernel containers write a readiness JSON file to `/run/ocap/<service>-ready.json` when the daemon is up. The host-side setup scripts poll this before proceeding.

After `test:e2e:docker` completes, structured pass/fail results are written to `packages/evm-wallet-experiment/logs/test-results.json` by the Vitest JSON reporter.

---

## Troubleshooting

**Containers fail to start**

- Verify Docker Model Runner is installed and the model is pulled: `docker model ls`
- Check port conflicts: `8545` (Anvil), `4337` (bundler), `4011`/`4012` (bundler-7702 QUIC)
- Run `docker:logs` to identify which service is stuck

**Stack appears healthy but setup commands fail**

- The readiness file may not yet exist — wait a few seconds and retry
- Check: `docker compose … exec kernel-home-bundler-7702 cat /run/ocap/kernel-home-bundler-7702-ready.json`

**`test:e2e:docker` fails with "Docker stack is not running"**

- Run `docker:up` and wait for all services to become healthy before starting the test runner

**Volume state is corrupted or stale**

- Full wipe: `yarn workspace @ocap/evm-wallet-experiment docker:down:volumes`
- Rebuild: `yarn workspace @ocap/evm-wallet-experiment docker:build:force`
