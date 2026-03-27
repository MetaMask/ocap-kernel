/**
 * OpenClaw MetaMask plugin: registers tools that let an LLM agent request
 * and use capabilities from a MetaMask capability vendor via the OCAP daemon.
 *
 * The vendor's public facet is accessed by redeeming an OCAP URL. The agent
 * can then request capabilities (e.g., PersonalMessageSigner) and call
 * methods on them (e.g., getAccounts, signMessage).
 *
 * Config (optional, in openclaw plugin settings or env vars):
 *   ocapCliPath   - Absolute path to the `ocap` CLI (auto-detected from monorepo)
 *   ocapUrl       - OCAP URL for the vendor public facet
 *   timeoutMs     - Daemon call timeout in ms (default: 60000)
 *   resetState    - Clear plugin state on register (default: false)
 */
import { resolve as resolvePath, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { makeDaemonCaller } from './daemon.ts';
import { createState } from './state.ts';
import { registerCallCapabilityTool } from './tools/call-capability.ts';
import { registerListCapabilitiesTool } from './tools/list-capabilities.ts';
import { registerRequestCapabilityTool } from './tools/request-capability.ts';
import type {
  OpenClawPluginApi,
  PluginConfigSchema,
  PluginEntry,
} from './types.ts';

const pluginDir = dirname(fileURLToPath(import.meta.url));
const DEFAULT_CLI = resolvePath(pluginDir, '../../kernel-cli/dist/app.mjs');
const DEFAULT_TIMEOUT_MS = 60_000;

const KNOWN_KEYS = new Set([
  'ocapCliPath',
  'ocapUrl',
  'timeoutMs',
  'resetState',
]);

const configSchema: PluginConfigSchema = {
  safeParse(value: unknown) {
    if (value === undefined) {
      return { success: true, data: undefined };
    }
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return {
        success: false,
        error: { issues: [{ path: [], message: 'expected config object' }] },
      };
    }
    const obj = value as Record<string, unknown>;
    for (const key of Object.keys(obj)) {
      if (!KNOWN_KEYS.has(key)) {
        return {
          success: false,
          error: {
            issues: [{ path: [key], message: `unknown config key "${key}"` }],
          },
        };
      }
    }
    if ('ocapCliPath' in obj && typeof obj.ocapCliPath !== 'string') {
      return {
        success: false,
        error: {
          issues: [{ path: ['ocapCliPath'], message: 'must be a string' }],
        },
      };
    }
    if ('ocapUrl' in obj && typeof obj.ocapUrl !== 'string') {
      return {
        success: false,
        error: {
          issues: [{ path: ['ocapUrl'], message: 'must be a string' }],
        },
      };
    }
    if ('timeoutMs' in obj && typeof obj.timeoutMs !== 'number') {
      return {
        success: false,
        error: {
          issues: [{ path: ['timeoutMs'], message: 'must be a number' }],
        },
      };
    }
    if ('resetState' in obj && typeof obj.resetState !== 'boolean') {
      return {
        success: false,
        error: {
          issues: [{ path: ['resetState'], message: 'must be a boolean' }],
        },
      };
    }
    return { success: true, data: value };
  },
  jsonSchema: {
    type: 'object',
    properties: {
      ocapCliPath: {
        type: 'string',
        description:
          'Absolute path to the ocap CLI entry point (.mjs file or binary).',
      },
      ocapUrl: {
        type: 'string',
        description: 'OCAP URL for the vendor public facet.',
      },
      timeoutMs: {
        type: 'number',
        description: 'Timeout for daemon calls in ms (default: 60000).',
      },
      resetState: {
        type: 'boolean',
        description: 'Clear plugin state on each register() call.',
      },
    },
    additionalProperties: false,
  },
};

/**
 * Resolve a config value from plugin config and env var, with env taking precedence.
 *
 * @param options - Resolution options.
 * @param options.pluginValue - Value from plugin config.
 * @param options.envVar - Environment variable name.
 * @param options.parse - Optional parser for the env var string.
 * @returns The resolved value, or undefined.
 */
function resolveConfig<T>(options: {
  pluginValue: unknown;
  envVar: string;
  parse?: (value: string) => T;
}): T | undefined {
  // eslint-disable-next-line n/no-process-env
  const envValue = process.env[options.envVar];
  if (envValue !== undefined && envValue !== '') {
    return options.parse ? options.parse(envValue) : (envValue as T);
  }
  return options.pluginValue as T | undefined;
}

/**
 * Register all MetaMask tools with the OpenClaw plugin API.
 *
 * @param api - The OpenClaw plugin API.
 */
function register(api: OpenClawPluginApi): void {
  const { pluginConfig } = api;

  const cliPath =
    (
      resolveConfig<string>({
        pluginValue: pluginConfig?.ocapCliPath,
        envVar: 'OCAP_CLI_PATH',
      }) ?? ''
    ).trim() || DEFAULT_CLI;

  const ocapUrl = (
    resolveConfig<string>({
      pluginValue: pluginConfig?.ocapUrl,
      envVar: 'OCAP_URL',
    }) ?? ''
  ).trim();

  const timeoutMs =
    resolveConfig<number>({
      pluginValue: pluginConfig?.timeoutMs,
      envVar: 'OCAP_TIMEOUT_MS',
      parse: Number,
    }) ?? DEFAULT_TIMEOUT_MS;

  const resetState =
    resolveConfig<boolean>({
      pluginValue: pluginConfig?.resetState,
      envVar: 'OCAP_RESET_STATE',
      parse: (value) => value.toLowerCase() === 'true',
    }) ?? false;

  if (!ocapUrl) {
    // eslint-disable-next-line no-console
    console.warn(
      '[metamask plugin] No OCAP URL configured. Set OCAP_URL env var or ocapUrl in plugin config.',
    );
  }

  const state = createState();

  // resetState is implicit since state always starts fresh, but if explicitly
  // enabled it also logs for visibility.
  if (resetState) {
    // eslint-disable-next-line no-console
    console.info('[metamask plugin] State reset enabled — starting clean.');
  }

  const daemon = makeDaemonCaller({ cliPath, timeoutMs });

  registerRequestCapabilityTool({ api, daemon, state, ocapUrl });
  registerCallCapabilityTool({ api, daemon, state });
  registerListCapabilitiesTool({ api, state });
}

const entry: PluginEntry = {
  id: 'metamask',
  name: 'MetaMask (OCAP)',
  description:
    'Request and use wallet capabilities from a MetaMask capability vendor ' +
    'via the OCAP kernel daemon. Supports requesting capabilities, calling ' +
    'methods on them, and listing obtained capabilities.',
  configSchema,
  register,
};

export default entry;
