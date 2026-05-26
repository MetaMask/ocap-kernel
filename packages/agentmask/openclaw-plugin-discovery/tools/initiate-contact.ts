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
 * Pull the `kind` discriminator out of a raw CapData-style response.
 * The body is a smallcaps-encoded JSON string with a leading `#` marker,
 * so naive `JSON.parse(body)` always throws — match the field by regex
 * instead, the same way `extractKref` reaches into the body.
 *
 * @param raw - The raw response from `daemon.queueMessage`.
 * @returns The `kind` string if found, otherwise `undefined`.
 */
function readResponseKind(raw: unknown): string | undefined {
  if (!raw || typeof raw !== 'object') {
    return undefined;
  }
  const { body } = raw as { body?: unknown };
  if (typeof body !== 'string') {
    return undefined;
  }
  return /"kind"\s*:\s*"([^"]+)"/u.exec(body)?.[1];
}

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

        // The ContactResponse is now tagged: `{ kind: 'public', service }`
        // for the Public access model, or shapes carrying credential /
        // code submission points for the other models. Only the Public
        // variant yields a directly-usable service ref; the others
        // require a credential or code-bundle submission step that
        // phase 3 doesn't implement.
        const kind = readResponseKind(raw);
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
                  JSON.stringify(raw, null, 2),
                ].join('\n'),
              },
            ],
            details: undefined,
          };
        }
        const extracted = extractKref(raw);
        if (!extracted) {
          throw new Error(
            'initiateContact: Public response had no extractable service kref',
          );
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
