/**
 * OpenClaw demo plugin: observes the agent's tool calls and provides
 * bookkeeping (artifacts, wallet, phase announcements) for the
 * orchestration demo. Posts events to demo-display.
 *
 * Config (optional, in openclaw plugin settings or env vars):
 *   displayUrl  - Base URL of the demo-display server (e.g. http://localhost:7777).
 *
 * This scaffold registers no tools yet; tool implementations land in a
 * later commit. The skeleton is in place so demo-services and
 * demo-display can be wired against a stable plugin id.
 */
import { exactOptional, object, string, validate } from '@metamask/superstruct';

import type {
  OpenClawPluginApi,
  PluginConfigSchema,
  PluginEntry,
} from './types.ts';

const PluginConfigStruct = object({
  displayUrl: exactOptional(string()),
});

const configSchema: PluginConfigSchema = {
  safeParse(value: unknown) {
    if (value === undefined) {
      return { success: true, data: undefined };
    }
    const [error, validated] = validate(value, PluginConfigStruct);
    if (error) {
      return {
        success: false,
        error: {
          issues: error.failures().map((failure) => ({
            path: failure.path,
            message: failure.message,
          })),
        },
      };
    }
    return { success: true, data: validated };
  },
  jsonSchema: {
    type: 'object',
    properties: {
      displayUrl: {
        type: 'string',
        description:
          'Base URL of the demo-display server (e.g. http://localhost:7777).',
      },
    },
    additionalProperties: false,
  },
};

/**
 * Register demo bookkeeping tools with the OpenClaw plugin API.
 *
 * @param _api - The OpenClaw plugin API. Unused at this stage; tool
 *   registrations land in a later commit.
 */
function register(_api: OpenClawPluginApi): void {
  // Intentionally empty: scaffold only. Tools are added in a later
  // commit alongside the demo-display event endpoint they post to.
}

const entry: PluginEntry = {
  id: 'demo',
  name: 'Orchestration Demo',
  description:
    'Observes agent tool calls and provides bookkeeping (artifacts, ' +
    'wallet, phase announcements) for the orchestration demo. Posts ' +
    'events to demo-display.',
  configSchema,
  register,
};

export default entry;
