# Local Simulation with Docker Compose

Run a complete home/away wallet stack on your machine — local EVM, bundler, two kernel daemons, and an optional OpenClaw AI agent — without any external API keys or real funds.

See [Docker setup](./docker.md) for prerequisites, build commands, and general troubleshooting.

---

## Quickstart

```bash
# 1. Start the stack (default pair: bundler-7702)
yarn workspace @ocap/evm-wallet-experiment docker:interactive:up

# 2. Initialize wallets and configure OpenClaw (once containers are healthy)
yarn workspace @ocap/evm-wallet-experiment docker:interactive:setup

# 3. Create a delegation from home to away and push it over the peer connection
yarn workspace @ocap/evm-wallet-experiment docker:delegate

# 4. Stop everything
yarn workspace @ocap/evm-wallet-experiment docker:interactive:down
```

---

## How it works

The Docker Compose stack mimics a real deployment:

- **`evm`** — Anvil local blockchain with pre-deployed Delegation Framework contracts
- **`bundler`** — Alto ERC-4337 bundler pointing at Anvil
- **`kernel-home-*`** — home kernel daemon (holds the SRP keyring, creates delegations)
- **`kernel-away-*`** — away kernel daemon (throwaway keyring, redeems delegations)

Two modes of operation:

| Mode            | What runs                      | When to use                                      |
| --------------- | ------------------------------ | ------------------------------------------------ |
| **Interactive** | One home/away pair             | Manual testing, development, AI agent simulation |
| **E2E test**    | All three pairs simultaneously | `yarn test:e2e:docker` automated tests           |

This guide covers interactive mode.

---

## Delegation modes

Interactive mode supports three delegation strategies. Choose one per session.

| Mode                     | Home account type                   | How away redeems                                | QUIC ports  |
| ------------------------ | ----------------------------------- | ----------------------------------------------- | ----------- |
| `bundler-7702` (default) | EIP-7702 stateless smart account    | ERC-4337 UserOp via bundler                     | 4011 / 4012 |
| `bundler-hybrid`         | Hybrid counterfactual smart account | ERC-4337 UserOp via bundler                     | 4021 / 4022 |
| `peer-relay`             | EIP-7702 stateless smart account    | Relayed to home over CapTP (no bundler on away) | 4031 / 4032 |

The OpenClaw AI agent is only available on the `bundler-7702` pair.

---

## Commands

### `docker:interactive:up`

```bash
yarn workspace @ocap/evm-wallet-experiment docker:interactive:up
# or with a specific pair:
yarn workspace @ocap/evm-wallet-experiment docker:interactive:up -- --pair bundler-hybrid
```

Starts the EVM, bundler, and one home/away kernel pair. Builds containers if needed.
The away container for `bundler-7702` is built with the `interactive` Dockerfile target, which includes the OpenClaw CLI.

Set `OCAP_INTERACTIVE_PAIR` to avoid passing `--pair` every time:

```bash
export OCAP_INTERACTIVE_PAIR=peer-relay
yarn workspace @ocap/evm-wallet-experiment docker:interactive:up
```

The `--pair` flag takes precedence over the environment variable.

### `docker:interactive:down`

```bash
yarn workspace @ocap/evm-wallet-experiment docker:interactive:down
```

Stops and removes containers. The `ocap-run` (state) and `ocap-logs` volumes are preserved, so the next `docker:interactive:up` resumes where it left off.

To do a full wipe including volumes:

```bash
docker compose -f packages/evm-wallet-experiment/docker/docker-compose.yml down -v
```

### `docker:interactive:setup`

```bash
yarn workspace @ocap/evm-wallet-experiment docker:interactive:setup
```

Runs after containers are healthy. Does the following in order:

1. **Wallet initialization (host-side)** — launches wallet subclusters on both kernels via their daemon sockets:

   - Home: SRP keyring (test mnemonic, pair-specific HD `addressIndex`), provider + bundler config, stateless 7702 smart account, OCAP URL issued for peer connection
   - Away: throwaway keyring, provider config, connects to home over QUIC via the issued OCAP URL
   - Writes `docker-delegation-home.json` and `docker-delegation-away.json` to the shared volume for use by `docker:delegate`

2. **OpenClaw setup (in away container, `bundler-7702` pair only)** — creates the `.openclaw/` config directory, generates a gateway auth token, writes provider config pointing at Docker Model Runner, and starts the OpenClaw gateway daemon on port 18789

### `docker:delegate`

```bash
yarn workspace @ocap/evm-wallet-experiment docker:delegate
```

Copies `docker/create-delegation.mjs` into the home kernel container and executes it there. The script:

1. Reads the delegation context files written by `docker:interactive:setup`
2. Resolves the correct delegate address for the chosen mode:
   - `bundler-*`: away's smart account (or EOA fallback)
   - `peer-relay`: home's smart account (redeems on behalf of home)
3. Builds caveats — by default a 1000 ETH native-token transfer limit; override with `CAVEAT_ETH_LIMIT=<wei>`
4. Calls `createDelegation()` on the home coordinator
5. Pushes the signed delegation to the away kernel over the live CapTP connection

Requires `docker:interactive:setup` to have been run first.

### `docker:setup:wallets`

```bash
yarn workspace @ocap/evm-wallet-experiment docker:setup:wallets
```

Runs only the wallet initialization step from `docker:interactive:setup` (no OpenClaw). Useful if you want to reinitialize wallet state without touching OpenClaw config.

### `docker:interactive:reset-openclaw`

```bash
yarn workspace @ocap/evm-wallet-experiment docker:interactive:reset-openclaw
```

Removes the `.openclaw/` state directory from the away container (conversation history, agent workspace). Only applies to the `bundler-7702` pair; other pairs print a message and exit. Does not stop containers or touch wallet state. Re-run `docker:interactive:setup` after this to reinitialize.

### `docker:logs`

```bash
yarn workspace @ocap/evm-wallet-experiment docker:logs
```

Tails logs from all running Compose services. Useful for watching delegation redemption or UserOp submission in real time.

---

## Switching delegation modes

```bash
# Stop the current pair
yarn workspace @ocap/evm-wallet-experiment docker:interactive:down

# Start a different pair
yarn workspace @ocap/evm-wallet-experiment docker:interactive:up -- --pair peer-relay

# Re-initialize wallets for the new pair
yarn workspace @ocap/evm-wallet-experiment docker:interactive:setup

# Create a delegation
yarn workspace @ocap/evm-wallet-experiment docker:delegate
```

Each pair uses a different BIP-44 address index on the shared test mnemonic (`test test test ... junk`) so home EOAs never collide when multiple pairs run simultaneously.

---

## OpenClaw AI agent (`bundler-7702` only)

When the stack is started with `bundler-7702` (the default) and `docker:interactive:setup` has run, the away container hosts an OpenClaw gateway that exposes wallet operations as AI tools.

The OpenClaw gateway runs on `localhost:18789` inside the away container and uses the Docker Model Runner LLM (`ai/qwen3.5:4B-UD-Q4_K_XL` by default, injected via Compose's `models` feature).

Available wallet tools via the OpenClaw plugin:

| Tool                   | Description                                  |
| ---------------------- | -------------------------------------------- |
| `wallet_accounts`      | List wallet accounts                         |
| `wallet_balance`       | Get ETH balance                              |
| `wallet_send`          | Send ETH                                     |
| `wallet_token_resolve` | Resolve a token symbol to a contract address |
| `wallet_token_balance` | Get ERC-20 token balance                     |
| `wallet_token_send`    | Send ERC-20 tokens                           |
| `wallet_token_info`    | Get token metadata                           |
| `wallet_swap_quote`    | Get a swap quote                             |
| `wallet_swap`          | Execute a token swap                         |
| `wallet_sign`          | Sign a message                               |
| `wallet_capabilities`  | Check wallet capabilities                    |

To reset conversation history without restarting:

```bash
yarn workspace @ocap/evm-wallet-experiment docker:interactive:reset-openclaw
yarn workspace @ocap/evm-wallet-experiment docker:interactive:setup
```

---

## Shared volume layout

After setup, the `ocap-run` Docker volume (mounted at `/run/ocap` inside containers) contains:

```
/run/ocap/
├── contracts.json                          # Deployed contract addresses (written by Anvil entrypoint)
├── docker-delegation-home.json             # Home context: socket path, coordinator kref, smart account address
├── docker-delegation-away.json             # Away context: socket path, coordinator kref, delegate address
├── kernel-home-bundler-7702/
│   ├── .ocap/daemon.sock                   # Kernel daemon Unix socket
│   └── db.sqlite                           # Kernel persistent state
├── kernel-away-bundler-7702/
│   ├── .ocap/daemon.sock
│   ├── db.sqlite
│   └── .openclaw/                          # OpenClaw state (bundler-7702 only)
│       ├── openclaw.json                   # Gateway config
│       └── agents/main/agent/
│           └── auth-profiles.json
└── ...                                     # Similar structure for other pairs
```

---

## Troubleshooting

**`docker:interactive:setup` fails**

- Containers may still be starting up — wait until all services are healthy, then retry
- Check with: `docker compose -f packages/evm-wallet-experiment/docker/docker-compose.yml --profile 7702 ps`

**`docker:delegate` fails with "context not found"**

- `docker:interactive:setup` must complete successfully before running `docker:delegate`
- The context files (`docker-delegation-home.json`, `docker-delegation-away.json`) must exist in the shared volume

**OpenClaw gateway not responding**

- Only available on `bundler-7702`; other pairs do not start the gateway
- Run `docker:interactive:reset-openclaw` then `docker:interactive:setup` to reinitialize

For general Docker issues (build failures, port conflicts, volume corruption), see [Docker setup](./docker.md#troubleshooting).
