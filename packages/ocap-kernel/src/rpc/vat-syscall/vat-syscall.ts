import type { VatSyscallResult } from '@agoric/swingset-liveslots';
import {
  tuple,
  literal,
  array,
  string,
  union,
  boolean,
  Struct,
} from '@metamask/superstruct';
import type { Infer } from '@metamask/superstruct';
import type { Handler, MethodSpec } from '@ocap/rpc-methods';

import {
  CapDataStruct,
  MessageStruct,
  VatOneResolutionStruct,
} from '../../types.ts';

const SendStruct = tuple([literal('send'), string(), MessageStruct]);
const SubscribeStruct = tuple([literal('subscribe'), string()]);
const ResolveStruct = tuple([
  literal('resolve'),
  array(VatOneResolutionStruct),
]);
const ExitStruct = tuple([literal('exit'), boolean(), CapDataStruct]);
const DropImportsStruct = tuple([literal('dropImports'), array(string())]);
const RetireImportsStruct = tuple([literal('retireImports'), array(string())]);
const RetireExportsStruct = tuple([literal('retireExports'), array(string())]);
const AbandonExportsStruct = tuple([
  literal('abandonExports'),
  array(string()),
]);
// These are bogus, but are needed to keep TypeScript happy
const CallNowStruct = tuple([
  literal('callNow'),
  string(),
  string(),
  CapDataStruct,
]);
const VatstoreGetStruct = tuple([literal('vatstoreGet'), string()]);
const VatstoreGetNextKeyStruct = tuple([
  literal('vatstoreGetNextKey'),
  string(),
]);
const VatstoreSetStruct = tuple([literal('vatstoreSet'), string(), string()]);
const VatstoreDeleteStruct = tuple([literal('vatstoreDelete'), string()]);

const VatSyscallParamsStruct = union([
  SendStruct,
  SubscribeStruct,
  ResolveStruct,
  ExitStruct,
  DropImportsStruct,
  RetireImportsStruct,
  RetireExportsStruct,
  AbandonExportsStruct,
  // These are bogus, but are needed to keep TypeScript happy
  CallNowStruct,
  VatstoreGetStruct,
  VatstoreGetNextKeyStruct,
  VatstoreSetStruct,
  VatstoreDeleteStruct,
]);

type VatSyscallParams = Infer<typeof VatSyscallParamsStruct>;

const VatSyscallResultStruct: Struct<VatSyscallResult> = union([
  tuple([
    literal('ok'),
    union([CapDataStruct, string(), array(string()), literal(null)]),
  ]),
  tuple([literal('error'), string()]),
]);

export const vatSyscallSpec: MethodSpec<
  'syscall',
  VatSyscallParams,
  Promise<VatSyscallResult>
> = {
  method: 'syscall',
  params: VatSyscallParamsStruct,
  result: VatSyscallResultStruct,
} as const;

export type HandleSyscall = (
  params: VatSyscallParams,
) => Promise<VatSyscallResult>;

type SyscallHooks = {
  handleSyscall: HandleSyscall;
};

export const vatSyscallHandler: Handler<
  'syscall',
  VatSyscallParams,
  Promise<VatSyscallResult>,
  SyscallHooks
> = {
  ...vatSyscallSpec,
  hooks: { handleSyscall: true },
  implementation: async ({ handleSyscall }, params) => {
    return await handleSyscall(params);
  },
} as const;
