import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, resolve as resolvePath } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Resolved configuration for the demo-display server. All consumer
 * code should depend on this struct, not on the env / file directly.
 */
export type DemoDisplayConfig = {
  observerUrl: string;
  ocapCliPath: string;
  ocapHome: string | undefined;
  port: number;
  pollIntervalMs: number;
  timeoutMs: number;
  eventLogCapacity: number;
  /**
   * URL of a ttyd server that fronts an `openclaw tui` session. When
   * set, the demo-display SPA renders the URL as an iframe in the
   * Producer dialog pane so the audience can watch the conversation
   * between the inventor and the producer LLM directly. When unset,
   * the pane shows a placeholder explaining how to configure it.
   */
  ttydUrl: string | undefined;
};

type RawConfig = Partial<{
  observerUrl: string;
  ocapCliPath: string;
  ocapHome: string;
  port: number;
  pollIntervalMs: number;
  timeoutMs: number;
  eventLogCapacity: number;
  ttydUrl: string;
}>;

const DEFAULT_PORT = 7777;
const DEFAULT_POLL_INTERVAL_MS = 2_500;
const DEFAULT_TIMEOUT_MS = 60_000;
const DEFAULT_EVENT_LOG_CAPACITY = 200;

/**
 * Resolution sources for the demo-display server config.
 *
 * Order of precedence: environment variables override config file,
 * which overrides built-in defaults. The same env-wins convention is
 * used by the openclaw discovery plugin.
 *
 * @param options - Resolution options.
 * @param options.env - Environment variables (typically `process.env`).
 * @param options.configPath - Optional explicit path to a JSON config
 *   file. Falls back to `$DEMO_DISPLAY_CONFIG`, then
 *   `~/.demo-display.json`. A missing file is not an error.
 * @returns The fully resolved configuration.
 * @throws If `matcherUrl` is missing from both env and file.
 */
export async function loadConfig(options: {
  env: NodeJS.ProcessEnv;
  configPath?: string;
}): Promise<DemoDisplayConfig> {
  const { env } = options;
  const fileConfig = await loadConfigFile(
    options.configPath ?? env.DEMO_DISPLAY_CONFIG,
  );

  const observerUrl = pickString(
    env.MATCHER_OBSERVER_URL,
    fileConfig.observerUrl,
  );
  if (observerUrl === undefined || observerUrl === '') {
    throw new Error(
      'demo-display: observerUrl is required (set MATCHER_OBSERVER_URL or ' +
        'add "observerUrl" to ~/.demo-display.json). This is the read-only ' +
        'observer URL printed by start-matcher.sh on its second output ' +
        'line, NOT the public matcher URL.',
    );
  }

  const ocapCliPath =
    pickString(env.OCAP_CLI_PATH, fileConfig.ocapCliPath) ?? defaultCliPath();

  const ocapHome = pickString(env.OCAP_HOME, fileConfig.ocapHome);

  const port =
    pickNumber(env.DEMO_DISPLAY_PORT, fileConfig.port) ?? DEFAULT_PORT;
  const pollIntervalMs =
    pickNumber(env.DEMO_POLL_INTERVAL_MS, fileConfig.pollIntervalMs) ??
    DEFAULT_POLL_INTERVAL_MS;
  const timeoutMs =
    pickNumber(env.OCAP_TIMEOUT_MS, fileConfig.timeoutMs) ?? DEFAULT_TIMEOUT_MS;
  const eventLogCapacity =
    pickNumber(undefined, fileConfig.eventLogCapacity) ??
    DEFAULT_EVENT_LOG_CAPACITY;

  const ttydUrl = pickString(env.DEMO_DISPLAY_TTYD_URL, fileConfig.ttydUrl);

  return {
    observerUrl,
    ocapCliPath,
    ocapHome,
    port,
    pollIntervalMs,
    timeoutMs,
    eventLogCapacity,
    ttydUrl,
  };
}

/* eslint-disable jsdoc/require-jsdoc */

function pickString(
  envValue: string | undefined,
  fileValue: string | undefined,
): string | undefined {
  const fromEnv = (envValue ?? '').trim();
  if (fromEnv.length > 0) {
    return fromEnv;
  }
  const fromFile = (fileValue ?? '').trim();
  return fromFile.length > 0 ? fromFile : undefined;
}

function pickNumber(
  envValue: string | undefined,
  fileValue: number | undefined,
): number | undefined {
  const fromEnv = (envValue ?? '').trim();
  if (fromEnv.length > 0) {
    const parsed = Number(fromEnv);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return typeof fileValue === 'number' && Number.isFinite(fileValue)
    ? fileValue
    : undefined;
}

async function loadConfigFile(path: string | undefined): Promise<RawConfig> {
  const resolvedPath = (path ?? '').trim() || defaultConfigPath();
  try {
    const raw = await readFile(resolvedPath, 'utf8');
    const parsed = JSON.parse(raw) as unknown;
    if (parsed === null || typeof parsed !== 'object') {
      return {};
    }
    return parsed as RawConfig;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return {};
    }
    throw error;
  }
}

function defaultConfigPath(): string {
  return resolvePath(homedir(), '.demo-display.json');
}

function defaultCliPath(): string {
  // Resolves to the monorepo's kernel-cli build output. Layout:
  //   packages/demo-display/dist/config.mjs  (this file at runtime)
  //   packages/kernel-cli/dist/app.mjs       (target)
  const moduleDir = dirname(fileURLToPath(import.meta.url));
  return resolvePath(moduleDir, '../../kernel-cli/dist/app.mjs');
}
