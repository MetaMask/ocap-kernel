import { object } from '@metamask/superstruct';
import { UnsafeJsonStruct } from '@metamask/utils';
import type { Json } from '@metamask/utils';
import { VatIdStruct } from '@ocap/kernel';
import type { Kernel, VatId } from '@ocap/kernel';
import { UiMethodRequestStruct } from '@ocap/kernel/rpc';
import type { UiMethodRequest } from '@ocap/kernel/rpc';
import type { MethodSpec, Handler } from '@ocap/rpc-methods';

export const sendVatCommandSpec: MethodSpec<
  'sendVatCommand',
  { id: VatId; payload: UiMethodRequest },
  Promise<{ result: Json }>
> = {
  method: 'sendVatCommand',
  params: object({ id: VatIdStruct, payload: UiMethodRequestStruct }),
  result: object({ result: UnsafeJsonStruct }),
};

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
