#!/usr/bin/env bash
# Away container entrypoint — runs setup-away.sh with Docker-appropriate flags,
# configures OpenClaw, then keeps the container alive for interactive use.
set -euo pipefail

ts() { date +%H:%M:%S; }

HOME_INFO="/run/ocap/home-info.json"
SETUP_AWAY="/app/packages/evm-wallet-experiment/scripts/setup-away.sh"
SETUP_OPENCLAW="/app/packages/evm-wallet-experiment/docker/setup-openclaw.mjs"

echo "[away] $(ts) Waiting for home kernel info..."
while [ ! -f "$HOME_INFO" ]; do sleep 1; done

# Extract OCAP URL and listen addresses from home info
OCAP_URL=$(node -e "console.log(JSON.parse(require('fs').readFileSync('$HOME_INFO','utf8')).ocapUrl)")
LISTEN_ADDRS=$(node -e "console.log(JSON.stringify(JSON.parse(require('fs').readFileSync('$HOME_INFO','utf8')).quicAddresses))")

echo "[away] $(ts) OCAP URL: ${OCAP_URL:0:40}..."
echo "[away] $(ts) Listen addrs: $LISTEN_ADDRS"

# Ensure HOME dir exists (HOME=/run/ocap/away so daemon socket lands in shared volume)
mkdir -p "$HOME"

# Remove stale daemon state from previous container runs (the shared volume
# persists across rebuilds). The SQLite database holds old kernel state from
# a previous home identity, causing slow recovery and timeout on restart.
rm -rf "$HOME/.ocap" 2>/dev/null || true

# Run the real setup-away.sh (starts daemon, launches subcluster, connects peer)
echo "[away] $(ts) Running setup-away.sh..."
EXTRA_ALLOWED_HOSTS="bundler:4337" bash "$SETUP_AWAY" \
  --ocap-url "$OCAP_URL" \
  --listen-addrs "$LISTEN_ADDRS" \
  --chain-id 31337 \
  --rpc-url "http://evm:8545" \
  --no-build \
  --non-interactive
echo "[away] $(ts) setup-away.sh completed"

# Write readiness marker for Docker healthcheck
node -e "
  const fs = require('fs');
  const { execSync } = require('child_process');
  const bin = 'node /app/packages/kernel-cli/dist/app.mjs';
  try {
    const status = JSON.parse(execSync(bin + ' daemon exec getStatus', { encoding: 'utf8' }));
    const subclusters = status.subclusters || [];
    const kref = subclusters[0]?.rootKref || 'ko4';
    const accountsRaw = execSync(bin + ' daemon exec queueMessage \'[\"' + kref + '\", \"getAccounts\", []]\' --timeout 10', { encoding: 'utf8' });
    const { body } = JSON.parse(accountsRaw);
    const accounts = JSON.parse(body.startsWith('#') ? body.slice(1) : body);
    const delegateAddress = Array.isArray(accounts) ? accounts[0] : 'unknown';
    fs.writeFileSync('/run/ocap/away-info.json', JSON.stringify({
      coordinatorKref: kref,
      delegateAddress,
      hasPeerWallet: true,
    }, null, 2));
    console.error('[away] info written — kref:', kref, 'delegate:', delegateAddress);
  } catch (e) {
    console.error('[away] warn: could not read status:', e.message);
    fs.writeFileSync('/run/ocap/away-info.json', JSON.stringify({
      coordinatorKref: 'ko4',
      delegateAddress: 'unknown',
      hasPeerWallet: false,
    }, null, 2));
  }
"
echo "[away] $(ts) away-info.json: $(cat /run/ocap/away-info.json)"

# DELEGATION_MODE controls how delegation redemption works:
#   bundler-7702 (default) — away has bundler + 7702 smart account
#   bundler-hybrid         — away has bundler + factory-deployed HybridDeleGator
#   peer-relay             — away has no bundler, relays to home via CapTP
DELEGATION_MODE="${DELEGATION_MODE:-bundler-7702}"

CONTRACTS="/run/ocap/contracts.json"
if [ -f "$CONTRACTS" ]; then
  KREF=$(node -e "console.log(JSON.parse(require('fs').readFileSync('/run/ocap/away-info.json','utf8')).coordinatorKref)")
  echo "[away] $(ts) Delegation mode: $DELEGATION_MODE"

  if [ "$DELEGATION_MODE" = "bundler-7702" ]; then
    # Get the actual throwaway EOA address via getCapabilities
    echo "[away] $(ts) Getting throwaway EOA address..."
    CAPS_JSON=$(printf '["%s", "getCapabilities", []]' "$KREF")
    DELEGATE_ADDR=$(node /app/packages/kernel-cli/dist/app.mjs daemon exec queueMessage "$CAPS_JSON" --timeout 10 2>&1 | node -e "
      const raw = require('fs').readFileSync('/dev/stdin','utf8').trim();
      try {
        const { body } = JSON.parse(raw);
        const obj = JSON.parse(body.startsWith('#') ? body.slice(1) : body);
        console.log((obj.localAccounts && obj.localAccounts[0]) || 'unknown');
      } catch { console.log('unknown'); }
    ")
    echo "[away] $(ts) Throwaway EOA: $DELEGATE_ADDR"

    echo "[away] $(ts) Funding throwaway EOA..."
    node -e "
      fetch('http://evm:8545', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0', id: 1,
          method: 'eth_sendTransaction',
          params: [{ from: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266', to: '$DELEGATE_ADDR', value: '0x8AC7230489E80000' }],
        }),
      }).then(r => r.json()).then(j => {
        if (j.error) { console.error(JSON.stringify(j.error)); process.exit(1); }
        console.log(j.result);
      }).catch(e => { console.error(e.message); process.exit(1); });
    "
    echo "[away] $(ts) Funded throwaway EOA with 10 ETH"

    echo "[away] $(ts) Configuring bundler..."
    BUNDLER_JSON=$(KREF="$KREF" node -e "
      const env = JSON.parse(require('fs').readFileSync('/run/ocap/contracts.json', 'utf8'));
      const msg = [process.env.KREF, 'configureBundler', [{
        bundlerUrl: 'http://bundler:4337',
        chainId: 31337,
        entryPoint: env.EntryPoint,
        environment: env,
      }]];
      process.stdout.write(JSON.stringify(msg));
    ")
    if node /app/packages/kernel-cli/dist/app.mjs daemon exec queueMessage "$BUNDLER_JSON" --timeout 10; then
      echo "[away] $(ts) configureBundler succeeded"
    else
      echo "[away] $(ts) configureBundler FAILED (exit $?)" >&2
    fi

    echo "[away] $(ts) Creating stateless7702 smart account..."
  SA_JSON=$(printf '["%s", "createSmartAccount", [{"chainId": 31337, "implementation": "stateless7702"}]]' "$KREF")
  SA_RESULT=$(node /app/packages/kernel-cli/dist/app.mjs daemon exec queueMessage "$SA_JSON" --timeout 30 2>&1) && {
    SA_ADDR=$(echo "$SA_RESULT" | node -e "
      const raw = require('fs').readFileSync('/dev/stdin','utf8').trim();
      try {
        const { body } = JSON.parse(raw);
        const obj = JSON.parse(body.startsWith('#') ? body.slice(1) : body);
        console.log(obj.address || 'unknown');
      } catch { console.log('unknown'); }
    ")
    echo "[away] $(ts) smart account (7702): $SA_ADDR"
    node -e "
      const fs = require('fs');
      const info = JSON.parse(fs.readFileSync('/run/ocap/away-info.json','utf8'));
      info.smartAccountAddress = '$SA_ADDR';
      fs.writeFileSync('/run/ocap/away-info.json', JSON.stringify(info, null, 2));
    "
  } || echo "[away] $(ts) createSmartAccount FAILED (non-fatal)"
  elif [ "$DELEGATION_MODE" = "bundler-hybrid" ]; then
    echo "[away] $(ts) Configuring bundler..."
    BUNDLER_JSON=$(KREF="$KREF" node -e "
      const env = JSON.parse(require('fs').readFileSync('/run/ocap/contracts.json', 'utf8'));
      const msg = [process.env.KREF, 'configureBundler', [{
        bundlerUrl: 'http://bundler:4337',
        chainId: 31337,
        entryPoint: env.EntryPoint,
        environment: env,
      }]];
      process.stdout.write(JSON.stringify(msg));
    ")
    if node /app/packages/kernel-cli/dist/app.mjs daemon exec queueMessage "$BUNDLER_JSON" --timeout 10; then
      echo "[away] $(ts) configureBundler succeeded"
    else
      echo "[away] $(ts) configureBundler FAILED (exit $?)" >&2
    fi

    echo "[away] $(ts) Creating hybrid smart account..."
    SA_JSON=$(printf '["%s", "createSmartAccount", [{"chainId": 31337}]]' "$KREF")
    SA_RESULT=$(node /app/packages/kernel-cli/dist/app.mjs daemon exec queueMessage "$SA_JSON" --timeout 15 2>&1) && {
      SA_ADDR=$(echo "$SA_RESULT" | node -e "
        const raw = require('fs').readFileSync('/dev/stdin','utf8').trim();
        try {
          const { body } = JSON.parse(raw);
          const obj = JSON.parse(body.startsWith('#') ? body.slice(1) : body);
          console.log(obj.address || 'unknown');
        } catch { console.log('unknown'); }
      ")
      SA_FACTORY=$(echo "$SA_RESULT" | node -e "
        const raw = require('fs').readFileSync('/dev/stdin','utf8').trim();
        try {
          const { body } = JSON.parse(raw);
          const obj = JSON.parse(body.startsWith('#') ? body.slice(1) : body);
          console.log(obj.factory || '');
        } catch { console.log(''); }
      ")
      SA_FACTORY_DATA=$(echo "$SA_RESULT" | node -e "
        const raw = require('fs').readFileSync('/dev/stdin','utf8').trim();
        try {
          const { body } = JSON.parse(raw);
          const obj = JSON.parse(body.startsWith('#') ? body.slice(1) : body);
          console.log(obj.factoryData || '');
        } catch { console.log(''); }
      ")
      echo "[away] $(ts) smart account (hybrid): $SA_ADDR"

      # Pre-deploy via factory + fund
      if [ -n "$SA_FACTORY" ] && [ -n "$SA_FACTORY_DATA" ] && [ "$SA_ADDR" != "unknown" ]; then
        echo "[away] $(ts) Pre-deploying via factory..."
        node -e "
          fetch('http://evm:8545', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              jsonrpc: '2.0', id: 1,
              method: 'eth_sendTransaction',
              params: [{ from: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266', to: '$SA_FACTORY', data: '$SA_FACTORY_DATA', gas: '0x1000000' }],
            }),
          }).then(r => r.json()).then(j => {
            if (j.error) { console.error(JSON.stringify(j.error)); process.exit(1); }
            console.log(j.result);
          }).catch(e => { console.error(e.message); process.exit(1); });
        "
        echo "[away] $(ts) Funding smart account..."
        node -e "
          fetch('http://evm:8545', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              jsonrpc: '2.0', id: 2,
              method: 'eth_sendTransaction',
              params: [{ from: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266', to: '$SA_ADDR', value: '0x8AC7230489E80000' }],
            }),
          }).then(r => r.json()).then(j => {
            if (j.error) console.error(JSON.stringify(j.error));
            else console.log(j.result);
          }).catch(e => console.error(e.message));
        "
      fi

      node -e "
        const fs = require('fs');
        const info = JSON.parse(fs.readFileSync('/run/ocap/away-info.json','utf8'));
        info.smartAccountAddress = '$SA_ADDR';
        fs.writeFileSync('/run/ocap/away-info.json', JSON.stringify(info, null, 2));
      "
    } || echo "[away] $(ts) createSmartAccount FAILED (non-fatal)"
  else
    echo "[away] $(ts) peer-relay mode — skipping bundler + smart account setup"
  fi
else
  echo "[away] $(ts) warn: no contracts.json — bundler not configured"
fi

# Configure OpenClaw (LLM provider, wallet plugin, auth profiles) in one pass.
# setup-openclaw.mjs writes the entire config from scratch — no `openclaw` CLI needed.
echo "[away] $(ts) Running setup-openclaw..."
node "$SETUP_OPENCLAW"
echo "[away] $(ts) setup-openclaw completed"

# Start the OpenClaw gateway in the background so plugin tools are available to the agent.
# Without the gateway, `openclaw agent` runs in embedded mode and plugins are not loaded.
openclaw gateway &
echo "[away] $(ts) OpenClaw gateway started (pid $!)"

echo "[away] $(ts) Ready. Shell in with: docker compose exec away bash"
echo "[away] Run OpenClaw: openclaw agent --agent main -m 'What is my wallet balance?'"
echo "[away] Swap LLM: LLM_API_TYPE=openai-completions LLM_BASE_URL=http://host.docker.internal:8080/v1 LLM_MODEL=glm-4.7-flash"

# Keep alive — daemon runs in background, container stays up for exec
sleep infinity
