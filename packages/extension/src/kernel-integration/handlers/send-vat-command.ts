import { object } from '@metamask/superstruct';
import { UnsafeJsonStruct } from '@metamask/utils';
import type { Json } from '@metamask/utils';
import { isVatCommandPayloadUI, VatIdStruct } from '@ocap/kernel';
import type { Kernel, VatId } from '@ocap/kernel';
import type { MethodSpec, Handler } from '@ocap/rpc-methods';

export const sendVatCommandSpec: MethodSpec<
  'sendVatCommand',
  { id: VatId; payload: Json },
  Promise<{ result: Json }>
> = {
  method: 'sendVatCommand',
  // TODO:rekm Use a more specific struct for the payload
  params: object({ id: VatIdStruct, payload: UnsafeJsonStruct }),
  result: object({ result: UnsafeJsonStruct }),
};

export type SendVatCommandHooks = {
  kernel: Pick<Kernel, 'sendVatCommand'>;
};

export const sendVatCommandHandler: Handler<
  'sendVatCommand',
  { id: VatId; payload: Json },
  Promise<{ result: Json }>,
  SendVatCommandHooks
> = {
  ...sendVatCommandSpec,
  hooks: { kernel: true },
  implementation: async ({ kernel }, params): Promise<{ result: Json }> => {
    if (!isVatCommandPayloadUI(params.payload)) {
      throw new Error('Invalid command payload');
    }

    const result = await kernel.sendVatCommand(params.id, params.payload);
    return { result };
  },
};
