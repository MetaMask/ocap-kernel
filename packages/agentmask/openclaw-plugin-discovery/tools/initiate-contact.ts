/**
 * `service_initiate_contact` tool: call `initiateContact()` on a
 * contact endpoint to obtain a usable service reference. Phase 3
 * only supports the Public access model; other variants are reported
 * as "not supported in this phase".
 */
import type { DaemonCaller } from '../daemon.ts';
import {
  baseNicknameFor,
  isRef,
  resolveContact,
  uniqueNickname,
} from '../state.ts';
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
            'OCAP URL, contact nickname, or ref (`@@j<n>`) identifying the contact endpoint.',
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
        const response = (await daemon.queueMessage({
          target: contactEntry.ref,
          method: 'initiateContact',
          args: [],
        })) as { kind?: unknown; service?: unknown };

        // The ContactResponse is tagged: `{ kind: 'public', service }`
        // for the Public access model, or shapes carrying credential /
        // code submission points for the other models. Only the Public
        // variant yields a directly-usable service ref; the others
        // require a credential or code-bundle submission step that
        // phase 3 doesn't implement.
        const kind =
          typeof response?.kind === 'string' ? response.kind : undefined;
        if (kind !== 'public') {
          return {
            content: [
              {
                type: 'text' as const,
                text: [
                  `initiateContact returned a non-public response (kind=${kind ?? 'unknown'}).`,
                  'Only the Public access model is supported in this phase.',
                  '',
                  'Raw response:',
                  JSON.stringify(response, null, 2),
                ].join('\n'),
              },
            ],
            details: undefined,
          };
        }
        const serviceRef =
          typeof response.service === 'string' ? response.service : undefined;
        if (!serviceRef || !isRef(serviceRef)) {
          throw new Error(
            `initiateContact: Public response had no extractable service ref (got ${JSON.stringify(response.service)})`,
          );
        }

        // Reuse an existing registration for the same ref if we've
        // seen it before.
        let existingNickname: string | undefined;
        for (const [nickname, entry] of state.services.entries()) {
          if (entry.ref === serviceRef) {
            existingNickname = nickname;
            break;
          }
        }
        const nickname =
          existingNickname ??
          uniqueNickname(
            baseNicknameFor(serviceRef),
            new Set(state.services.keys()),
          );
        if (!existingNickname) {
          const entry: ServiceEntry = {
            ref: serviceRef,
            nickname,
            fromContact: contactEntry.nickname,
          };
          state.services.set(nickname, entry);
        }

        return {
          content: [
            {
              type: 'text' as const,
              text: [
                `Obtained service "${nickname}" (ref ${serviceRef}).`,
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
