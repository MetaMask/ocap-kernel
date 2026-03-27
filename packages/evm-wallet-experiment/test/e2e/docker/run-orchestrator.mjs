/* eslint-disable n/no-process-exit, n/no-sync, import-x/no-unresolved */
/**
 * Docker E2E test orchestrator.
 *
 * Runs inside the `test` container after all services (evm, llm, home, away)
 * are healthy. Connects to both daemon sockets, sets up delegations, and
 * runs tool-level and agent loop test suites.
 */

import '@metamask/kernel-shims/endoify-node';

import { readFileSync } from 'node:fs';

import { makeDaemonClient } from './helpers/daemon-client.mjs';
import { makeLogCollector } from './helpers/log-collector.mjs';
import { runAgentLoopTests } from './run-agent-loop-tests.mjs';
import { runDelegationTests } from './run-delegation-tests.mjs';
import { runToolTests } from './run-tool-tests.mjs';

const HOME_INFO_PATH = '/run/ocap/home-info.json';
const AWAY_INFO_PATH = '/run/ocap/away-info.json';
const HOME_SOCKET = '/run/ocap/home.sock';
const AWAY_SOCKET = '/run/ocap/away/.ocap/daemon.sock';

async function main() {
  console.log('\n=== Docker E2E Test Orchestrator ===\n');

  // -- Read service info --
  console.log('Reading service info...');
  const homeInfo = JSON.parse(readFileSync(HOME_INFO_PATH, 'utf-8'));
  const awayInfo = JSON.parse(readFileSync(AWAY_INFO_PATH, 'utf-8'));
  console.log(`  Home coordinator: ${homeInfo.coordinatorKref}`);
  console.log(
    `  Home smart account: ${homeInfo.smartAccountAddress || 'none'}`,
  );
  console.log(`  Away coordinator: ${awayInfo.coordinatorKref}`);
  console.log(`  Away delegate: ${awayInfo.delegateAddress}`);
  console.log(
    `  Away smart account: ${awayInfo.smartAccountAddress || 'none'}`,
  );

  // -- Create daemon clients --
  const home = makeDaemonClient(HOME_SOCKET);
  const away = makeDaemonClient(AWAY_SOCKET);

  const callHome = (method, args) =>
    home.callVat(homeInfo.coordinatorKref, method, args);
  const callAway = (method, args) =>
    away.callVat(awayInfo.coordinatorKref, method, args);

  // -- Verify basic connectivity --
  console.log('\nVerifying daemon connectivity...');
  const homeStatus = await home.rpc('getStatus');
  const awayStatus = await away.rpc('getStatus');
  console.log(`  Home vats: ${homeStatus.result.vats.length}`);
  console.log(`  Away vats: ${awayStatus.result.vats.length}`);

  // -- Create delegation (home → away smart account or delegate) --
  const delegate = awayInfo.smartAccountAddress || awayInfo.delegateAddress;
  console.log(
    `\nCreating delegation (home → ${delegate.slice(0, 10)}... ${awayInfo.smartAccountAddress ? 'smart account' : 'EOA'})...`,
  );
  const delegation = await callHome('createDelegation', [
    {
      delegate,
      caveats: [],
      chainId: 31337,
    },
  ]);
  console.log(`  Delegation ID: ${delegation.id.slice(0, 20)}...`);

  // Push delegation to away
  console.log('Transferring delegation to away...');
  try {
    await callAway('receiveDelegation', [delegation]);
    console.log('  Delegation received.');
  } catch (error) {
    console.log(
      `  Delegation transfer failed (may retry in tests): ${error.message}`,
    );
  }

  // -- Initialize log collector --
  const logCollector = makeLogCollector('/logs');

  // -- Run test suites --
  console.log(`\n${'='.repeat(50)}`);
  console.log('Running tool-level tests...');
  console.log('='.repeat(50));
  const toolResults = await runToolTests({
    callHome,
    callAway,
    homeInfo,
    awayInfo,
    delegation,
    logCollector,
  });

  console.log(`\n${'='.repeat(50)}`);
  console.log('Running delegation redemption tests...');
  console.log('='.repeat(50));
  const delegationResults = await runDelegationTests({
    callHome,
    callAway,
    homeInfo,
    awayInfo,
    delegation,
  });

  console.log(`\n${'='.repeat(50)}`);
  console.log('Running agent loop tests...');
  console.log('='.repeat(50));
  const agentResults = await runAgentLoopTests({
    callAway,
    awayInfo,
    logCollector,
  });

  // -- Summary --
  const totalPassed =
    toolResults.passed + delegationResults.passed + agentResults.passed;
  const totalFailed =
    toolResults.failed + delegationResults.failed + agentResults.failed;

  console.log(`\n${'='.repeat(50)}`);
  console.log(`Results: ${totalPassed} passed, ${totalFailed} failed`);
  console.log(
    `  Tool tests: ${toolResults.passed} passed, ${toolResults.failed} failed`,
  );
  console.log(
    `  Delegation tests: ${delegationResults.passed} passed, ${delegationResults.failed} failed`,
  );
  console.log(
    `  Agent tests: ${agentResults.passed} passed, ${agentResults.failed} failed`,
  );
  console.log('='.repeat(50));

  process.exit(totalFailed > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error('FATAL:', error);
  process.exit(1);
});
