import {
  object,
  array,
  record,
  unknown,
  tuple,
  union,
  literal,
  refine,
  string,
  boolean,
  is,
} from '@metamask/superstruct';
import type { Infer } from '@metamask/superstruct';

import {
  isVatId,
  MessageStruct,
  VatConfigStruct,
  CapDataStruct,
} from '../types.js';
import type { VatId } from '../types.js';

type VatMessageId = `${VatId}:${number}`;

const isVatMessageId = (value: unknown): value is VatMessageId =>
  value === 'none' ||
  (typeof value === 'string' &&
    /^\w+:\d+$/u.test(value) &&
    isVatId(value.split(':')[0]));

export const VatTestCommandMethod = {
  ping: 'ping',
} as const;

export const VatCommandMethod = {
  ...VatTestCommandMethod,
  initVat: 'initVat',
  deliver: 'deliver',
  // XXX due to the goofy way we define messages, the method and reply roles for `syscall` are swapped
  syscall: 'syscall',
} as const;

const VatMessageIdStruct = refine(string(), 'VatMessageId', isVatMessageId);

export const VatTestMethodStructs = {
  [VatCommandMethod.ping]: object({
    method: literal(VatCommandMethod.ping),
    params: literal(null),
  }),
} as const;

const VatOneResolutionStruct = tuple([string(), boolean(), CapDataStruct]);

const VatDelivery = {
  message: 'message',
  notify: 'notify',
  dropExports: 'dropExports',
  retireExports: 'retireExports',
  retireImports: 'retireImports',
  changeVatOptions: 'changeVatOptions',
  startVat: 'startVat',
  stopVat: 'stopVat',
  bringOutYourDead: 'bringOutYourDead',
} as const;

const VatDeliveryStructs = {
  [VatDelivery.message]: tuple([
    literal(VatDelivery.message),
    string(),
    MessageStruct,
  ]),
  [VatDelivery.notify]: tuple([
    literal(VatDelivery.notify),
    array(VatOneResolutionStruct),
  ]),
  [VatDelivery.dropExports]: tuple([
    literal(VatDelivery.dropExports),
    array(string()),
  ]),
  [VatDelivery.retireExports]: tuple([
    literal(VatDelivery.retireExports),
    array(string()),
  ]),
  [VatDelivery.retireImports]: tuple([
    literal(VatDelivery.retireImports),
    array(string()),
  ]),
  [VatDelivery.changeVatOptions]: tuple([
    literal(VatDelivery.changeVatOptions),
    record(string(), unknown()),
  ]),
  [VatDelivery.startVat]: tuple([literal(VatDelivery.startVat), CapDataStruct]),
  [VatDelivery.stopVat]: tuple([literal(VatDelivery.stopVat), CapDataStruct]),
  [VatDelivery.bringOutYourDead]: tuple([
    literal(VatDelivery.bringOutYourDead),
  ]),
};

const VatDeliveryStruct = union([
  VatDeliveryStructs.message,
  VatDeliveryStructs.notify,
  VatDeliveryStructs.dropExports,
  VatDeliveryStructs.retireExports,
  VatDeliveryStructs.retireImports,
  VatDeliveryStructs.changeVatOptions,
  VatDeliveryStructs.startVat,
  VatDeliveryStructs.stopVat,
  VatDeliveryStructs.bringOutYourDead,
]);

const VatSyscall = {
  send: 'send',
  subscribe: 'subscribe',
  resolve: 'resolve',
  exit: 'exit',
  dropImports: 'dropImports',
  retireImports: 'retireImports',
  retireExports: 'retireExports',
  abandonExports: 'abandonExports',
  // These are bogus, but are needed to keep TypeScript happy
  callNow: 'callNow',
  vatstoreGet: 'vatstoreGet',
  vatstoreGetNextKey: 'vatstoreGetNextKey',
  vatstoreSet: 'vatstoreSet',
  vatstoreDelete: 'vatstoreDelete',
} as const;

const VatSyscallStructs = {
  [VatSyscall.send]: tuple([literal(VatSyscall.send), string(), MessageStruct]),
  [VatSyscall.subscribe]: tuple([literal(VatSyscall.subscribe), string()]),
  [VatSyscall.resolve]: tuple([
    literal(VatSyscall.resolve),
    array(VatOneResolutionStruct),
  ]),
  [VatSyscall.exit]: tuple([
    literal(VatSyscall.exit),
    boolean(),
    CapDataStruct,
  ]),
  [VatSyscall.dropImports]: tuple([
    literal(VatSyscall.dropImports),
    array(string()),
  ]),
  [VatSyscall.retireImports]: tuple([
    literal(VatSyscall.retireImports),
    array(string()),
  ]),
  [VatSyscall.retireExports]: tuple([
    literal(VatSyscall.retireExports),
    array(string()),
  ]),
  [VatSyscall.abandonExports]: tuple([
    literal(VatSyscall.abandonExports),
    array(string()),
  ]),
  // These are bogus, but are needed to keep TypeScript happy
  [VatSyscall.callNow]: tuple([
    literal(VatSyscall.callNow),
    string(),
    string(),
    CapDataStruct,
  ]),
  [VatSyscall.vatstoreGet]: tuple([literal(VatSyscall.vatstoreGet), string()]),
  [VatSyscall.vatstoreGetNextKey]: tuple([
    literal(VatSyscall.vatstoreGetNextKey),
    string(),
  ]),
  [VatSyscall.vatstoreSet]: tuple([
    literal(VatSyscall.vatstoreSet),
    string(),
    string(),
  ]),
  [VatSyscall.vatstoreDelete]: tuple([
    literal(VatSyscall.vatstoreDelete),
    string(),
  ]),
} as const;

const VatSyscallStruct = union([
  VatSyscallStructs.send,
  VatSyscallStructs.subscribe,
  VatSyscallStructs.resolve,
  VatSyscallStructs.exit,
  VatSyscallStructs.dropImports,
  VatSyscallStructs.retireImports,
  VatSyscallStructs.retireExports,
  VatSyscallStructs.abandonExports,
  // These are bogus, but are needed to keep TypeScript happy
  VatSyscallStructs.callNow,
  VatSyscallStructs.vatstoreGet,
  VatSyscallStructs.vatstoreGetNextKey,
  VatSyscallStructs.vatstoreSet,
  VatSyscallStructs.vatstoreDelete,
]);

export const VatMethodStructs = {
  ...VatTestMethodStructs,
  [VatCommandMethod.initVat]: object({
    method: literal(VatCommandMethod.initVat),
    params: VatConfigStruct,
  }),
  [VatCommandMethod.deliver]: object({
    method: literal(VatCommandMethod.deliver),
    params: VatDeliveryStruct,
  }),
  [VatCommandMethod.syscall]: object({
    method: literal(VatCommandMethod.syscall),
    params: VatSyscallStruct,
  }),
} as const;

export type VatCommand = Infer<typeof VatCommandStruct>;

export const VatTestReplyStructs = {
  [VatCommandMethod.ping]: object({
    method: literal(VatCommandMethod.ping),
    params: string(),
  }),
} as const;

const VatReplyStructs = {
  ...VatTestReplyStructs,
  [VatCommandMethod.initVat]: object({
    method: literal(VatCommandMethod.initVat),
    params: string(),
  }),
  [VatCommandMethod.deliver]: object({
    method: literal(VatCommandMethod.deliver),
    params: literal(null),
  }),
  [VatCommandMethod.syscall]: object({
    method: literal(VatCommandMethod.syscall),
    params: array(string()),
  }),
} as const;

const VatCommandStruct = object({
  id: VatMessageIdStruct,
  payload: union([
    VatMethodStructs.ping,
    VatMethodStructs.initVat,
    VatMethodStructs.deliver,
    VatReplyStructs.syscall, // Note swapped call/reply role
  ]),
});

const VatCommandReplyStruct = object({
  id: VatMessageIdStruct,
  payload: union([
    VatReplyStructs.ping,
    VatReplyStructs.initVat,
    VatReplyStructs.deliver,
    VatMethodStructs.syscall, // Note swapped call/reply role
  ]),
});

export type VatCommandReply = Infer<typeof VatCommandReplyStruct>;

export const isVatCommand = (value: unknown): value is VatCommand =>
  is(value, VatCommandStruct);

export const isVatCommandReply = (value: unknown): value is VatCommandReply =>
  is(value, VatCommandReplyStruct);

export type VatReplyParams<Method extends keyof typeof VatReplyStructs> = Infer<
  (typeof VatReplyStructs)[Method]
>['params'];

export type VatCommandReturnType = {
  [Method in keyof typeof VatReplyStructs]: VatReplyParams<Method>;
};
