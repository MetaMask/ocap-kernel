import type { MethodSpec, Handler } from '@metamask/kernel-rpc-methods';
import { VatIdStruct } from '@metamask/ocap-kernel';
import type { Kernel, VatId } from '@metamask/ocap-kernel';
import { UiMethodRequestStruct } from '@metamask/ocap-kernel/rpc';
import type { UiMethodRequest } from '@metamask/ocap-kernel/rpc';
import { object } from '@metamask/superstruct';
import type { Infer } from '@metamask/superstruct';
import { UnsafeJsonStruct } from '@metamask/utils';
import type { Json } from '@metamask/utils';

export const sendVatCommandSpec: MethodSpec<
  'sendVatCommand',
  { id: VatId; payload: UiMethodRequest },
  Promise<{ result: Json }>
> = {
  method: 'sendVatCommand',
  params: object({ id: VatIdStruct, payload: UiMethodRequestStruct }),
  result: object({ result: UnsafeJsonStruct }),
};

export type SendVatCommandParams = Infer<(typeof sendVatCommandSpec)['params']>;

export type SendVatCommandHooks = {
  kernel: Pick<Kernel, 'sendVatCommand'>;
};

export const sendVatCommandHandler: Handler<
  'sendVatCommand',
  { id: VatId; payload: UiMethodRequest },
  Promise<{ result: Json }>,
  SendVatCommandHooks
> = {
  ...sendVatCommandSpec,
  hooks: { kernel: true },
  implementation: async ({ kernel }, params): Promise<{ result: Json }> => {
    const result = await kernel.sendVatCommand(params.id, params.payload);
    return { result };
  },
};

/**
 * Asserts that the given params are valid for the `sendVatCommand` method.
 *
 * @param params - The params to assert.
 */
export function assertVatCommandParams(
  params: unknown,
): asserts params is SendVatCommandParams {
  sendVatCommandSpec.params.assert(params);
}
