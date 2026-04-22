/* eslint-disable n/no-sync, n/no-process-env, n/no-process-exit */
import { spawnSync } from 'node:child_process';

import {
  awayServiceForInteractivePair,
  interactiveDockerComposeArgs,
  INTERACTIVE_PACKAGE_ROOT,
} from './demo-compose-lib.mjs';

const argv = process.argv.slice(2);
const { pair, dockerArgs } = interactiveDockerComposeArgs(argv);

const wallets = spawnSync(
  'yarn',
  ['tsx', 'test/e2e/docker/setup-wallets.ts', pair],
  {
    cwd: INTERACTIVE_PACKAGE_ROOT,
    stdio: 'inherit',
    env: process.env,
  },
);
if (wallets.status !== 0) {
  process.exit(wallets.status ?? 1);
}
const away = awayServiceForInteractivePair(pair);

if (pair !== 'bundler-7702') {
  console.log(
    'OpenClaw setup skipped (interactive Dockerfile target + OpenClaw run only on kernel-away-bundler-7702).',
  );
  process.exit(0);
}

const setupOpenclaw = spawnSync(
  'docker',
  [
    ...dockerArgs,
    'exec',
    away,
    'node',
    '/app/packages/evm-wallet-experiment/docker/setup-openclaw.mjs',
  ],
  { cwd: INTERACTIVE_PACKAGE_ROOT, stdio: 'inherit', env: process.env },
);
if (setupOpenclaw.status !== 0) {
  process.exit(setupOpenclaw.status ?? 1);
}

const gateway = spawnSync(
  'docker',
  [
    ...dockerArgs,
    'exec',
    '-d',
    away,
    'node',
    '/usr/local/lib/node_modules/openclaw/openclaw.mjs',
    'gateway',
  ],
  { cwd: INTERACTIVE_PACKAGE_ROOT, stdio: 'inherit', env: process.env },
);
if (gateway.status !== 0) {
  process.exit(gateway.status ?? 1);
}

console.log(
  `OpenClaw configured + gateway started (${away}). Shell: OCAP_INTERACTIVE_PAIR=${pair} yarn docker:demo:attach:away`,
);
