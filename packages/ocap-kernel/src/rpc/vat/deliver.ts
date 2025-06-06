import type { Handler, MethodSpec } from '@metamask/kernel-rpc-methods';
import {
  tuple,
  literal,
  array,
  string,
  record,
  union,
} from '@metamask/superstruct';
import type { Infer } from '@metamask/superstruct';
import { UnsafeJsonStruct } from '@metamask/utils';

import { VatDeliveryResultStruct } from './shared.ts';
import {
  CapDataStruct,
  MessageStruct,
  VatOneResolutionStruct,
} from '../../types.ts';
import type { VatDeliveryResult } from '../../types.ts';

const MessageDeliveryStruct = tuple([
  literal('message'),
  string(),
  MessageStruct,
]);

const NotifyDeliveryStruct = tuple([
  literal('notify'),
  array(VatOneResolutionStruct),
]);

const DropExportsDeliveryStruct = tuple([
  literal('dropExports'),
  array(string()),
]);

const RetireExportsDeliveryStruct = tuple([
  literal('retireExports'),
  array(string()),
]);

const RetireImportsDeliveryStruct = tuple([
  literal('retireImports'),
  array(string()),
]);

const ChangeVatOptionsDeliveryStruct = tuple([
  literal('changeVatOptions'),
  record(string(), UnsafeJsonStruct),
]);

const StartVatDeliveryStruct = tuple([literal('startVat'), CapDataStruct]);

const StopVatDeliveryStruct = tuple([literal('stopVat'), CapDataStruct]);

const BringOutYourDeadDeliveryStruct = tuple([literal('bringOutYourDead')]);

const VatDeliveryParamsStruct = union([
  MessageDeliveryStruct,
  NotifyDeliveryStruct,
  DropExportsDeliveryStruct,
  RetireExportsDeliveryStruct,
  RetireImportsDeliveryStruct,
  ChangeVatOptionsDeliveryStruct,
  StartVatDeliveryStruct,
  StopVatDeliveryStruct,
  BringOutYourDeadDeliveryStruct,
]);

type VatDeliveryParams = Infer<typeof VatDeliveryParamsStruct>;

export type DeliverSpec = MethodSpec<
  'deliver',
  VatDeliveryParams,
  Promise<VatDeliveryResult>
>;

export const deliverSpec: DeliverSpec = {
  method: 'deliver',
  params: VatDeliveryParamsStruct,
  result: VatDeliveryResultStruct,
} as const;

export type HandleDelivery = (
  params: VatDeliveryParams,
) => Promise<VatDeliveryResult>;

type DeliverHooks = {
  handleDelivery: HandleDelivery;
};

export type DeliverHandler = Handler<
  'deliver',
  VatDeliveryParams,
  Promise<VatDeliveryResult>,
  DeliverHooks
>;

export const deliverHandler: DeliverHandler = {
  ...deliverSpec,
  hooks: { handleDelivery: true },
  implementation: async ({ handleDelivery }, params) => {
    return await handleDelivery(params);
  },
} as const;
