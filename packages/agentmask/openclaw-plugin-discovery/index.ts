/**
 * OpenClaw discovery plugin: lets an LLM agent find services via a
 * service matcher and consume them through the contact protocol.
 *
 * Config (optional, in openclaw plugin settings or env vars):
 *   ocapCliPath   - Absolute path to the `ocap` CLI (auto-detected from monorepo)
 *   matcherUrl    - OCAP URL for the service matcher
 *   timeoutMs     - Daemon call timeout in ms (default: 60000)
 *   resetState    - Clear plugin state on register (default: false)
 */
import { resolve as resolvePath, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { makeDaemonCaller } from './daemon.ts';
import { createState } from './state.ts';
import { registerCallServiceTool } from './tools/call-service.ts';
import { registerFindServicesTool } from './tools/find-services.ts';
import { registerGetDescriptionTool } from './tools/get-description.ts';
import { registerInitiateContactTool } from './tools/initiate-contact.ts';
import { registerListTrackedTool } from './tools/list-tracked.ts';
import { registerRedeemMatcherTool } from './tools/redeem-matcher.ts';
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
  'ocapHome',
  'matcherUrl',
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
    if ('ocapHome' in obj && typeof obj.ocapHome !== 'string') {
      return {
        success: false,
        error: {
          issues: [{ path: ['ocapHome'], message: 'must be a string' }],
        },
      };
    }
    if ('matcherUrl' in obj && typeof obj.matcherUrl !== 'string') {
      return {
        success: false,
        error: {
          issues: [{ path: ['matcherUrl'], message: 'must be a string' }],
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
      ocapHome: {
        type: 'string',
        description:
          'OCAP home directory for the daemon this plugin should target. ' +
          'Passed as `--home` on every spawned `ocap` invocation. Default: ~/.ocap.',
      },
      matcherUrl: {
        type: 'string',
        description: 'OCAP URL for the service matcher.',
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
function resolveConfig<Type>(options: {
  pluginValue: unknown;
  envVar: string;
  parse?: (value: string) => Type;
}): Type | undefined {
  // eslint-disable-next-line n/no-process-env
  const envValue = process.env[options.envVar];
  if (envValue !== undefined && envValue !== '') {
    return options.parse ? options.parse(envValue) : (envValue as Type);
  }
  return options.pluginValue as Type | undefined;
}

/**
 * Register all discovery tools with the OpenClaw plugin API.
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

  const ocapHome = (
    resolveConfig<string>({
      pluginValue: pluginConfig?.ocapHome,
      envVar: 'OCAP_HOME',
    }) ?? ''
  ).trim();

  const preconfiguredMatcherUrl = (
    resolveConfig<string>({
      pluginValue: pluginConfig?.matcherUrl,
      envVar: 'OCAP_MATCHER_URL',
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

  const state = createState();
  if (resetState) {
    // eslint-disable-next-line no-console
    console.info('[discovery plugin] State reset enabled — starting clean.');
  }

  const daemon = makeDaemonCaller({
    cliPath,
    ocapHome: ocapHome || undefined,
    timeoutMs,
  });

  registerRedeemMatcherTool({ api, daemon, state });
  registerFindServicesTool({ api, daemon, state });
  registerGetDescriptionTool({ api, daemon, state });
  registerInitiateContactTool({ api, daemon, state });
  registerCallServiceTool({ api, daemon, state });
  registerListTrackedTool({ api, state });

  // If a matcher URL was supplied via config or env, eagerly redeem it
  // so the agent can start calling findServices without an extra step.
  if (preconfiguredMatcherUrl) {
    daemon
      .redeemUrl(preconfiguredMatcherUrl)
      .then((kref) => {
        state.matcher = { url: preconfiguredMatcherUrl, kref };
        // eslint-disable-next-line no-console
        console.info(
          `[discovery plugin] Pre-redeemed matcher URL; kref=${kref}`,
        );
        return undefined;
      })
      .catch((error: unknown) => {
        // eslint-disable-next-line no-console
        console.warn(
          '[discovery plugin] Failed to pre-redeem matcher URL:',
          error,
        );
      });
  }
}

const entry: PluginEntry = {
  id: 'discovery',
  name: 'Service Discovery',
  description:
    'Find and consume services via a service matcher plus the contact ' +
    'protocol defined in @metamask/service-discovery-types.',
  configSchema,
  register,
};

export default entry;
