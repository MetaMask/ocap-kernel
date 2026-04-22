/* eslint-disable n/no-sync, n/no-process-env, n/no-process-exit */
import { spawnSync } from 'node:child_process';

import {
  awayServiceForInteractivePair,
  homeServiceForInteractivePair,
  interactiveDockerComposeArgs,
  INTERACTIVE_PACKAGE_ROOT,
} from './demo-compose-lib.mjs';

const [side, ...rest] = process.argv.slice(2);

if (side !== 'away' && side !== 'home') {
  console.error(`Usage: attach.mjs <away|home> [--pair <pair>]`);
  process.exit(1);
}

const { pair, dockerArgs } = interactiveDockerComposeArgs(rest);
const service =
  side === 'away'
    ? awayServiceForInteractivePair(pair)
    : homeServiceForInteractivePair(pair);

const spawned = spawnSync(
  'docker',
  [...dockerArgs, 'exec', '-it', service, 'bash'],
  {
    cwd: INTERACTIVE_PACKAGE_ROOT,
    stdio: 'inherit',
    env: process.env,
  },
);
process.exit(spawned.status ?? 1);
