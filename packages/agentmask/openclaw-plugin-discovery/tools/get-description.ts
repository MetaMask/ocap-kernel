/**
 * `service_get_description` tool: fetch the ServiceDescription from a
 * contact endpoint (identified by OCAP URL, contact nickname, or kref).
 */
import type { DaemonCaller } from '../daemon.ts';
import { resolveContact } from '../state.ts';
import type { PluginState } from '../state.ts';
import type { OpenClawPluginApi, ToolResponse } from '../types.ts';

/**
 * Register the service_get_description tool.
 *
 * @param options - Registration options.
 * @param options.api - The OpenClaw plugin API.
 * @param options.daemon - The daemon caller.
 * @param options.state - The plugin state.
 */
export function registerGetDescriptionTool(options: {
  api: OpenClawPluginApi;
  daemon: DaemonCaller;
  state: PluginState;
}): void {
  const { api, daemon, state } = options;

  api.registerTool({
    name: 'service_get_description',
    label: 'Fetch service description',
    description:
      'Inspect a target and return its API description. Works on either ' +
      'a contact endpoint (calling `getServiceDescription`) or a service ' +
      'handle obtained via `service_initiate_contact` (calling the ' +
      'discoverable-exo `__getDescription__`). `contact` may be an OCAP ' +
      'URL, a previously-cached contact or service nickname, or a kref.',
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
      // eslint-disable-next-line no-console
      console.error(
        `[discovery/get_description] ENTER contact=${JSON.stringify(params.contact)}\n` +
          `  state.contacts keys: ${[...state.contacts.keys()].join(', ') || '(empty)'}\n` +
          `  state.contacts urls: ${[...state.contacts.values()].map((entry) => entry.url ?? '(no url)').join(', ') || '(empty)'}`,
      );
      try {
        const entry = await resolveContact({
          ref: params.contact,
          state,
          daemon,
        });
        // eslint-disable-next-line no-console
        console.error(
          `[discovery/get_description] resolved to nickname=${entry.nickname} kref=${entry.kref} url=${entry.url ?? '(none)'}`,
        );
        // ContactPoint endpoints expose `getServiceDescription`.
        // Discoverable service exos (the target the LLM sees after
        // `service_initiate_contact` returns) instead expose the
        // `__getDescription__` dunder from `makeDiscoverableExo`. Try
        // the contact-endpoint method first, then fall back to the
        // discoverable-exo one so the LLM can inspect either kind of
        // target with the same tool.
        let description: unknown;
        try {
          description = await daemon.queueMessage({
            target: entry.kref,
            method: 'getServiceDescription',
            args: [],
          });
        } catch (contactError: unknown) {
          const contactMessage =
            contactError instanceof Error
              ? contactError.message
              : String(contactError);
          if (
            !contactMessage.includes('has no method "getServiceDescription"')
          ) {
            throw contactError;
          }
          // eslint-disable-next-line no-console
          console.error(
            `[discovery/get_description] getServiceDescription missing on kref=${entry.kref}; falling back to __getDescription__`,
          );
          description = await daemon.queueMessage({
            target: entry.kref,
            method: '__getDescription__',
            args: [],
          });
        }
        // eslint-disable-next-line no-console
        console.error(
          `[discovery/get_description] description obtained for kref=${entry.kref}`,
        );
        return {
          content: [
            {
              type: 'text' as const,
              text: [
                `Contact: ${entry.nickname}${entry.url ? ` (${entry.url})` : ''}`,
                `Kref: ${entry.kref}`,
                '',
                'Service description:',
                JSON.stringify(description, null, 2),
              ].join('\n'),
            },
          ],
          details: undefined,
        };
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        // eslint-disable-next-line no-console
        console.error(
          `[discovery/get_description] ERROR contact=${JSON.stringify(params.contact)}: ${message}`,
        );
        return {
          content: [{ type: 'text' as const, text: `Error: ${message}` }],
          details: undefined,
        };
      }
    },
  });
}
