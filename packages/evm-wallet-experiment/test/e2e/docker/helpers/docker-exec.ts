/* eslint-disable n/no-sync */
/**
 * Helpers for communicating with Docker containers from the host.
 *
 * Uses `docker compose exec` to run commands inside containers and
 * `fetch` against exposed ports for direct RPC.
 */
import { execSync } from 'node:child_process';
import { resolve } from 'node:path';

const COMPOSE_FILE = resolve(
  __dirname,
  '../../../../docker/docker-compose.yml',
);
const CLI = 'node /app/packages/kernel-cli/dist/app.mjs';

const EVM_RPC = 'http://localhost:8545';

/**
 * Run a command inside a Docker container via `docker compose exec`.
 *
 * @param service - The compose service name.
 * @param command - The command to run.
 * @returns stdout as a string.
 */
export function dockerExec(service: string, command: string): string {
  return execSync(
    `docker compose -f ${COMPOSE_FILE} exec -T ${service} ${command}`,
    { encoding: 'utf-8', timeout: 60_000 },
  ).trim();
}

/**
 * Read a JSON file from inside a container.
 *
 * @param service - The compose service name.
 * @param filePath - Absolute path inside the container.
 * @returns Parsed JSON.
 */
export function readContainerJson<T = unknown>(
  service: string,
  filePath: string,
): T {
  const raw = dockerExec(service, `cat ${filePath}`);
  return JSON.parse(raw) as T;
}

/**
 * Call a coordinator vat method via the kernel CLI inside a container.
 *
 * @param service - The compose service name ('home' or 'away').
 * @param kref - The coordinator kref (e.g. 'ko4').
 * @param method - The method name.
 * @param args - Method arguments.
 * @returns The deserialized result.
 */
export function callVat(
  service: string,
  kref: string,
  method: string,
  args: unknown[] = [],
): unknown {
  const message = JSON.stringify([kref, method, args]);
  // Shell-escape the JSON for the exec command
  const escaped = message.replace(/'/gu, "'\\''");
  const raw = execSync(
    `docker compose -f ${COMPOSE_FILE} exec -T ${service} ${CLI} daemon exec queueMessage '${escaped}' --timeout 60`,
    { encoding: 'utf-8', timeout: 90_000 },
  ).trim();

  const response = JSON.parse(raw) as { body: string };
  const body = response.body.startsWith('#')
    ? response.body.slice(1)
    : response.body;
  const parsed = JSON.parse(body) as unknown;

  // Check for error responses
  if (
    parsed !== null &&
    typeof parsed === 'object' &&
    '#error' in (parsed as Record<string, unknown>)
  ) {
    throw new Error(
      (parsed as Record<string, string>)['#error'] ?? 'Unknown vat error',
    );
  }

  return parsed;
}

/**
 * Send a JSON-RPC request to the EVM node (via exposed port).
 *
 * @param method - The RPC method.
 * @param params - The RPC params.
 * @returns The result field from the JSON-RPC response.
 */
export async function evmRpc(
  method: string,
  params: unknown[] = [],
): Promise<unknown> {
  const response = await fetch(EVM_RPC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  const json = (await response.json()) as {
    result?: unknown;
    error?: { message: string };
  };
  if (json.error) {
    throw new Error(`EVM RPC error: ${json.error.message}`);
  }
  return json.result;
}

/**
 * Check if the Docker stack is running and healthy.
 *
 * @returns true if all required services are healthy.
 */
export function isStackHealthy(): boolean {
  try {
    const output = execSync(
      `docker compose -f ${COMPOSE_FILE} ps --format json`,
      { encoding: 'utf-8', timeout: 10_000 },
    );
    const services = output
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line) as { Service: string; Health: string });
    const required = ['evm', 'bundler', 'home', 'away'];
    return required.every((name) =>
      services.some((svc) => svc.Service === name && svc.Health === 'healthy'),
    );
  } catch {
    return false;
  }
}
