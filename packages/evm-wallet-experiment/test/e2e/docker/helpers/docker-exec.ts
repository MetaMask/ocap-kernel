/* eslint-disable n/no-sync */
/**
 * Helpers for communicating with Docker containers from the host.
 *
 * Uses `docker compose exec` to run commands inside containers and
 * `fetch` against exposed ports for direct RPC.
 */
import { execSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const currentDir = dirname(fileURLToPath(import.meta.url));

const COMPOSE_FILE = resolve(
  currentDir,
  '../../../../docker/docker-compose.yml',
);
const CLI = 'node /app/packages/kernel-cli/dist/app.mjs';

const EVM_RPC = 'http://localhost:8545';

/**
 * Single-quote a string for use inside a POSIX shell single-quoted word.
 *
 * @param value - Raw string to wrap.
 * @returns The string wrapped in single quotes with internal quotes escaped.
 */
function shellSingleQuote(value: string): string {
  return `'${value.replace(/'/gu, "'\\''")}'`;
}

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
 * @param options - Optional settings.
 * @param options.daemonTimeoutSeconds - `daemon queueMessage --timeout` (default 60). Use a larger value for long polls (e.g. `waitForUserOpReceipt`).
 * @returns The deserialized result.
 */
export function callVat(
  service: string,
  kref: string,
  method: string,
  args: unknown[] = [],
  options?: { daemonTimeoutSeconds?: number },
): unknown {
  const daemonTimeout = options?.daemonTimeoutSeconds ?? 60;
  const execTimeoutMs = daemonTimeout * 1000 + 30_000;
  const argsJson = JSON.stringify(args);
  const raw = execSync(
    `docker compose -f ${COMPOSE_FILE} exec -T ${service} ${CLI} daemon queueMessage ${shellSingleQuote(kref)} ${shellSingleQuote(method)} ${shellSingleQuote(argsJson)} --timeout ${daemonTimeout}`,
    { encoding: 'utf-8', timeout: execTimeoutMs },
  ).trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`callVat ${method}: daemon returned non-JSON output`);
  }

  if (typeof parsed === 'string' && /^\[.+: /u.test(parsed)) {
    throw new Error(parsed);
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

/**
 * Execute a kernel-level daemon RPC method inside a container.
 *
 * Unlike {@link callVat} which sends a vat message via `queueMessage`,
 * this calls a top-level daemon RPC method (e.g. `launchSubcluster`,
 * `registerLocationHints`, `getStatus`).
 *
 * @param service - The compose service name.
 * @param method - The daemon RPC method name.
 * @param params - Optional parameters object.
 * @returns The deserialized result.
 */
export function daemonExec(
  service: string,
  method: string,
  params?: unknown,
): unknown {
  const args =
    params === undefined
      ? method
      : `${method} '${JSON.stringify(params).replace(/'/gu, "'\\''")}'`;
  const raw = execSync(
    `docker compose -f ${COMPOSE_FILE} exec -T ${service} ${CLI} daemon exec ${args} --timeout 60`,
    { encoding: 'utf-8', timeout: 90_000 },
  ).trim();
  return JSON.parse(raw) as unknown;
}

export type ServiceInfo = {
  socketPath: string;
  peerId?: string;
  listenAddresses?: string[];
};

/**
 * Read the readiness file for a kernel service.
 *
 * @param service - The compose service name (e.g. 'home', 'away').
 * @returns The parsed readiness info.
 */
export function getServiceInfo(service: string): ServiceInfo {
  return readContainerJson<ServiceInfo>(
    service,
    `/run/ocap/${service}-ready.json`,
  );
}

export type ContractAddresses = {
  EntryPoint: string;
  DelegationManager: string;
  SimpleFactory: string;
  implementations: Record<string, string>;
  caveatEnforcers: Record<string, string>;
};

/**
 * Read the deployed contract addresses from the EVM container.
 *
 * @returns The parsed contract addresses.
 */
export function readContracts(): ContractAddresses {
  return readContainerJson<ContractAddresses>(
    'evm',
    '/run/ocap/contracts.json',
  );
}
