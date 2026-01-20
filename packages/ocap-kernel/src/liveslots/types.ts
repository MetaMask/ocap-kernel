import type {
  VatDeliveryObject,
  VatOneResolution,
  SwingSetCapData,
  LiveSlotsOptions,
  MeterControl,
} from '@agoric/swingset-liveslots';
import type { CapData } from '@endo/marshal';

export type SyscallResult = SwingSetCapData | string | string[] | null;
export type DispatchFn = (vdo: VatDeliveryObject) => Promise<void>;
export type LiveSlots = {
  dispatch: DispatchFn;
};

export type Syscall = {
  send: (
    target: string,
    methargs: CapData<string>,
    result?: string,
  ) => SyscallResult;
  subscribe: (vpid: string) => SyscallResult;
  resolve: (resolutions: VatOneResolution[]) => SyscallResult;
  exit: (isFailure: boolean, info: CapData<string>) => SyscallResult;
  dropImports: (vrefs: string[]) => SyscallResult;
  retireImports: (vrefs: string[]) => SyscallResult;
  retireExports: (vrefs: string[]) => SyscallResult;
  abandonExports: (vrefs: string[]) => SyscallResult;
  callNow: (_target: string, method: string, args: unknown[]) => SyscallResult;
  vatstoreGet: (key: string) => string | undefined;
  vatstoreGetNextKey: (priorKey: string) => string | undefined;
  vatstoreSet: (key: string, value: string) => void;
  vatstoreDelete: (key: string) => void;
};

export type GCTools = {
  WeakRef: WeakRefConstructor;
  FinalizationRegistry: FinalizationRegistryConstructor;
  waitUntilQuiescent: () => Promise<void>;
  gcAndFinalize: () => Promise<void>;
  meterControl: MeterControl;
};

export type MakeLiveSlotsFn = (
  syscall: Syscall,
  forVatId: string,
  vatPowers: Record<string, unknown>,
  liveSlotsOptions: LiveSlotsOptions,
  gcTools: GCTools,
  liveSlotsConsole?: Pick<Console, 'debug' | 'log' | 'info' | 'warn' | 'error'>,
  buildVatNamespace?: unknown,
) => LiveSlots;
