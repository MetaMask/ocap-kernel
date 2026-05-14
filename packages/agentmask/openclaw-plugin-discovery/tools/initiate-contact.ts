/**
 * `service_initiate_contact` tool: call `initiateContact()` on a contact
 * endpoint to obtain a usable service reference. Phase 3 only supports
 * the Public access model; other variants are reported as "not supported
 * in this phase".
 */
import type { DaemonCaller } from '../daemon.ts';
import { extractKref, resolveContact, uniqueNickname } from '../state.ts';
import type { PluginState, ServiceEntry } from '../state.ts';
import type { OpenClawPluginApi, ToolResponse } from '../types.ts';

/**
 * Register the service_initiate_contact tool.
 *
 * @param options - Registration options.
 * @param options.api - The OpenClaw plugin API.
 * @param options.daemon - The daemon caller.
 * @param options.state - The plugin state.
 */
export function registerInitiateContactTool(options: {
  api: OpenClawPluginApi;
  daemon: DaemonCaller;
  state: PluginState;
}): void {
  const { api, daemon, state } = options;

  api.registerTool({
    name: 'service_initiate_contact',
    label: 'Initiate contact with a service',
    description:
      'Call `initiateContact()` on a contact endpoint, obtaining a ' +
      'reference to the actual service. For services with the Public ' +
      'access model (all that phase-3 supports), the resulting reference ' +
      'is immediately usable via `service_call`.',
    parameters: {
      type: 'object',
      properties: {
        contact: {
          type: 'string',
          description:
            'OCAP URL, contact nickname, or kref identifying the contact endpoint.',
        },
      },
      required: ['contact'],
    },
    async execute(
      _id: string,
      params: { contact: string },
    ): Promise<ToolResponse> {
      try {
        const contactEntry = await resolveContact({
          ref: params.contact,
          state,
          daemon,
        });
        const raw = await daemon.queueMessage({
          target: contactEntry.kref,
          method: 'initiateContact',
          args: [],
          raw: true,
        });

        const extracted = extractKref(raw);
        if (!extracted) {
          // Not a direct service reference — likely a Permissioned or
          // ValidatedClient response descriptor. Report the raw shape so
          // the agent can decide what to do (phase 3 punts on this).
          return {
            content: [
              {
                type: 'text' as const,
                text: [
                  'initiateContact returned a non-public response. Only the ',
                  'Public access model is supported in this phase.',
                  '',
                  'Raw response:',
                  JSON.stringify(raw, null, 2),
                ].join('\n'),
              },
            ],
            details: undefined,
          };
        }

        const baseNickname = extracted.alleged ?? `service:${extracted.kref}`;
        const nickname = uniqueNickname(
          baseNickname,
          new Set(state.services.keys()),
        );
        const entry: ServiceEntry = {
          kref: extracted.kref,
          nickname,
          fromContact: contactEntry.nickname,
        };
        state.services.set(nickname, entry);

        return {
          content: [
            {
              type: 'text' as const,
              text: [
                `Obtained service "${nickname}" (kref ${extracted.kref}).`,
                `Via contact: ${contactEntry.nickname}.`,
                'Use `service_call` to invoke methods on it.',
              ].join('\n'),
            },
          ],
          details: undefined,
        };
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: 'text' as const, text: `Error: ${message}` }],
          details: undefined,
        };
      }
    },
  });
}
