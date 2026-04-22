/* eslint-disable n/no-sync, n/no-process-env, n/no-process-exit, jsdoc/require-jsdoc */
/**
 * Shared parsing + `docker compose` argv for interactive stack (one home/away pair).
 * Keep delegation-mode keys in sync with `test/e2e/docker/helpers/docker-e2e-kernel-services.ts`.
 */
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dockerLibDir = dirname(fileURLToPath(import.meta.url));
export const INTERACTIVE_PACKAGE_ROOT = join(dockerLibDir, '..');

const COMPOSE_FILE = join(
  INTERACTIVE_PACKAGE_ROOT,
  'docker/docker-compose.yml',
);
const ENV_FILE = join(INTERACTIVE_PACKAGE_ROOT, 'docker/.env.interactive');

/** @type {Record<string, string>} */
export const INTERACTIVE_PAIR_TO_PROFILE = {
  'bundler-7702': '7702',
  'bundler-hybrid': '4337',
  'peer-relay': 'relay',
};

export const DEFAULT_INTERACTIVE_PAIR = 'bundler-7702';

export function awayServiceForInteractivePair(pair) {
  if (pair === 'bundler-7702') {
    return 'kernel-away-bundler-7702';
  }
  if (pair === 'bundler-hybrid') {
    return 'kernel-away-bundler-hybrid';
  }
  if (pair === 'peer-relay') {
    return 'kernel-away-peer-relay';
  }
  throw new Error(`Unknown interactive pair: ${pair}`);
}

export function homeServiceForInteractivePair(pair) {
  if (pair === 'bundler-7702') {
    return 'kernel-home-bundler-7702';
  }
  if (pair === 'bundler-hybrid') {
    return 'kernel-home-bundler-hybrid';
  }
  if (pair === 'peer-relay') {
    return 'kernel-home-peer-relay';
  }
  throw new Error(`Unknown interactive pair: ${pair}`);
}

export function parseInteractiveComposeArgv(argv) {
  let pair = process.env.OCAP_INTERACTIVE_PAIR ?? DEFAULT_INTERACTIVE_PAIR;
  const rest = [...argv];
  const i = rest.indexOf('--pair');
  if (i !== -1 && rest[i + 1]) {
    pair = rest[i + 1];
    rest.splice(i, 2);
  }
  const profile = INTERACTIVE_PAIR_TO_PROFILE[pair];
  if (!profile) {
    console.error(
      `Unknown pair "${pair}". Use: ${Object.keys(INTERACTIVE_PAIR_TO_PROFILE).join(', ')} (env OCAP_INTERACTIVE_PAIR, or --pair before compose subcommands).`,
    );
    process.exit(1);
  }
  return { pair, profile, rest };
}

export function interactiveDockerComposeArgs(argv) {
  const { pair, profile, rest } = parseInteractiveComposeArgv(argv);
  return {
    pair,
    profile,
    rest,
    dockerArgs: [
      'compose',
      '-f',
      COMPOSE_FILE,
      '--env-file',
      ENV_FILE,
      '--profile',
      profile,
      ...rest,
    ],
  };
}

export function runInteractiveCompose(argv) {
  const { pair, profile, dockerArgs } = interactiveDockerComposeArgs(argv);
  if (process.env.DEBUG_OCAP_INTERACTIVE_COMPOSE) {
    console.error(
      `[ocap interactive compose] OCAP_INTERACTIVE_PAIR=${pair} profile=${profile}`,
    );
  }
  const spawned = spawnSync('docker', dockerArgs, {
    cwd: INTERACTIVE_PACKAGE_ROOT,
    stdio: 'inherit',
    env: process.env,
  });
  if (spawned.error) {
    throw spawned.error;
  }
  process.exit(spawned.status ?? 1);
}
