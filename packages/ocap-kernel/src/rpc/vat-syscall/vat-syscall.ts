import type { Handler, MethodSpec } from '@metamask/kernel-rpc-methods';
import {
  tuple,
  literal,
  array,
  string,
  union,
  boolean,
} from '@metamask/superstruct';
import type { Infer } from '@metamask/superstruct';

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

export const vatSyscallSpec: MethodSpec<'syscall', VatSyscallParams, void> = {
  method: 'syscall',
  params: VatSyscallParamsStruct,
} as const;

export type HandleSyscall = (params: VatSyscallParams) => void;

type SyscallHooks = {
  handleSyscall: HandleSyscall;
};

export const vatSyscallHandler: Handler<
  'syscall',
  VatSyscallParams,
  void,
  SyscallHooks
> = {
  ...vatSyscallSpec,
  hooks: { handleSyscall: true },
  implementation: ({ handleSyscall }, params) => {
    handleSyscall(params);
  },
} as const;
