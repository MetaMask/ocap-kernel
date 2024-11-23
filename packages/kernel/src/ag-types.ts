// XXX placeholder to get around @agoric/swingset-liveslots package configuration issues

// This is Agoric code that breaks some of our local eslint rules. Disabling
// those because the code's not for us to redefine.
/* eslint-disable @typescript-eslint/naming-convention, @typescript-eslint/no-explicit-any */

import type { CapData } from '@endo/marshal';

// Type for makeLiveSlots callback
export type makeLiveSlots = () => void;

/**
 * The MeterControl object gives liveslots a mechanism to disable metering for certain GC-sensitive
 * regions of code. Only the XS worker can actually do metering, but we track the enabled/disabled
 * status on all workers, so that the assertions can be exercised more thoroughly (via non-XS unit
 * tests). MeterControl.isMeteringDisabled()===false does not mean metering is happening, it just
 * means that MeterControl isn't disabling it.
 */
export type MeterControl = {
  isMeteringDisabled: () => boolean; // Ask whether metering is currently disabled.
  assertIsMetered: unknown;
  assertNotMetered: unknown;
  runWithoutMetering: unknown; // Run a callback outside metering
  runWithoutMeteringAsync: unknown; // Run an async callback outside metering
  unmetered: unknown; // Wrap a callback with runWithoutMetering
};

export type LiveSlotsOptions = {
  enableDisavow?: boolean;
  relaxDurabilityRules?: boolean;
  allowStateShapeChanges?: boolean;
};

export type SwingSetCapData = CapData<string>;

export type Message = {
  methargs: SwingSetCapData; // of [method, args]
  result?: string | undefined | null;
};

export type VatDeliveryMessage = ['message', string, Message];
export type VatOneResolution = [string, boolean, SwingSetCapData];
export type VatDeliveryNotify = ['notify', VatOneResolution[]];
export type VatDeliveryDropExports = ['dropExports', string[]];
export type VatDeliveryRetireExports = ['retireExports', string[]];
export type VatDeliveryRetireImports = ['retireImports', string[]];
export type VatDeliveryChangeVatOptions = [
  'changeVatOptions',
  Record<string, unknown>,
];
export type VatDeliveryStartVat = ['startVat', SwingSetCapData];
export type VatDeliveryStopVat = ['stopVat', SwingSetCapData];
export type VatDeliveryBringOutYourDead = ['bringOutYourDead'];

export type VatDeliveryObject =
  | VatDeliveryMessage
  | VatDeliveryNotify
  | VatDeliveryDropExports
  | VatDeliveryRetireExports
  | VatDeliveryRetireImports
  | VatDeliveryChangeVatOptions
  | VatDeliveryStartVat
  | VatDeliveryStopVat
  | VatDeliveryBringOutYourDead;

export type MeterConsumption = {
  compute: number;
};

export type VatDeliveryResult =
  | ['ok', any, MeterConsumption | null]
  | ['error', string, MeterConsumption | null];

export type VatSyscallSend = ['send', string, Message];
export type VatSyscallCallNow = ['callNow', string, string, SwingSetCapData];
export type VatSyscallSubscribe = ['subscribe', string];
export type VatSyscallResolve = ['resolve', VatOneResolution[]];
export type VatSyscallExit = ['exit', boolean, SwingSetCapData];
export type VatSyscallVatstoreGet = ['vatstoreGet', string];
export type VatSyscallVatstoreGetNextKey = ['vatstoreGetNextKey', string];
export type VatSyscallVatstoreSet = ['vatstoreSet', string, string];
export type VatSyscallVatstoreDelete = ['vatstoreDelete', string];
export type VatSyscallDropImports = ['dropImports', string[]];
export type VatSyscallRetireImports = ['retireImports', string[]];
export type VatSyscallRetireExports = ['retireExports', string[]];
export type VatSyscallAbandonExports = ['abandonExports', string[]];

export type VatSyscallObject =
  | VatSyscallSend
  | VatSyscallCallNow
  | VatSyscallSubscribe
  | VatSyscallResolve
  | VatSyscallExit
  | VatSyscallVatstoreGet
  | VatSyscallVatstoreGetNextKey
  | VatSyscallVatstoreSet
  | VatSyscallVatstoreDelete
  | VatSyscallDropImports
  | VatSyscallRetireImports
  | VatSyscallRetireExports
  | VatSyscallAbandonExports;

export type VatSyscallResultOk = [
  'ok',
  SwingSetCapData | string | string[] | null,
];
export type VatSyscallResultError = ['error', string];
export type VatSyscallResult = VatSyscallResultOk | VatSyscallResultError;

export type VatSyscallHandler = (vso: VatSyscallObject) => VatSyscallResult;

export type PromiseWatcher<V, A extends any[] = unknown[]> = {
  onFulfilled?: (value: V, ...args: A) => void;
  onRejected?: (reason: unknown, ...args: A) => void;
};
