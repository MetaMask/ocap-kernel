import {
  object,
  define,
  literal,
  string,
  optional,
  boolean,
  record,
} from '@metamask/superstruct';
import { vi } from 'vitest';

type ResetMocks = () => void;
type SetMockBehavior = (options: {
  isVatConfig?: boolean;
  isVatId?: boolean;
  isKernelCommand?: boolean;
}) => void;

export const setupOcapKernelMock = (): {
  resetMocks: ResetMocks;
  setMockBehavior: SetMockBehavior;
} => {
  let isVatConfigMock = true;
  let isVatIdMock = true;
  let isKernelCommandMock = true;
  // Mock implementation
  vi.doMock('@ocap/kernel', () => {
    const VatIdStruct = define<unknown>('VatId', () => isVatIdMock);
    const VatConfigStruct = define<unknown>('VatConfig', () => isVatConfigMock);

    return {
      isKernelCommand: () => isKernelCommandMock,
      isVatId: () => isVatIdMock,
      isVatConfig: () => isVatConfigMock,
      VatIdStruct,
      VatConfigStruct,
      ClusterConfigStruct: object({
        bootstrap: string(),
        forceReset: optional(boolean()),
        vats: record(string(), VatConfigStruct),
        bundles: optional(record(string(), VatConfigStruct)),
      }),
      KernelSendMessageStruct: object({
        id: literal('v0'),
        payload: object({
          method: literal('ping'),
          params: literal(null),
        }),
      }),
      isVatCommandReply: vi.fn(() => true),
      VatCommandMethod: {
        ping: 'ping',
      },
      KernelCommandMethod: {},
      VatWorkerServiceCommandMethod: {
        launch: 'launch',
        terminate: 'terminate',
        terminateAll: 'terminateAll',
      },
    };
  });

  return {
    resetMocks: (): void => {
      isVatConfigMock = true;
      isVatIdMock = true;
      isKernelCommandMock = true;
    },
    setMockBehavior: (options: {
      isVatConfig?: boolean;
      isVatId?: boolean;
      isKernelCommand?: boolean;
    }): void => {
      if (typeof options.isVatConfig === 'boolean') {
        isVatConfigMock = options.isVatConfig;
      }
      if (typeof options.isVatId === 'boolean') {
        isVatIdMock = options.isVatId;
      }
      if (typeof options.isKernelCommand === 'boolean') {
        isKernelCommandMock = options.isKernelCommand;
      }
    },
  };
};
