import {
  object,
  define,
  literal,
  string,
  boolean,
  record,
  exactOptional,
} from '@metamask/superstruct';
import { vi } from 'vitest';

type ResetMocks = () => void;
type SetMockBehavior = (options: {
  isVatConfig?: boolean;
  isVatId?: boolean;
}) => void;

export const setupOcapKernelMock = (): {
  resetMocks: ResetMocks;
  setMockBehavior: SetMockBehavior;
} => {
  let isVatConfigMock = true;
  let isVatIdMock = true;
  // Mock implementation
  vi.doMock('@ocap/kernel', () => {
    const VatIdStruct = define<unknown>('VatId', () => isVatIdMock);
    const VatConfigStruct = define<unknown>('VatConfig', () => isVatConfigMock);

    return {
      isVatId: () => isVatIdMock,
      isVatConfig: () => isVatConfigMock,
      VatIdStruct,
      VatConfigStruct,
      ClusterConfigStruct: object({
        bootstrap: string(),
        forceReset: exactOptional(boolean()),
        vats: record(string(), VatConfigStruct),
        bundles: exactOptional(record(string(), VatConfigStruct)),
      }),
      KernelSendMessageStruct: object({
        id: literal('v0'),
        payload: object({
          method: literal('ping'),
          params: literal(null),
        }),
      }),
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
    },
    setMockBehavior: (options: {
      isVatConfig?: boolean;
      isVatId?: boolean;
    }): void => {
      if (typeof options.isVatConfig === 'boolean') {
        isVatConfigMock = options.isVatConfig;
      }
      if (typeof options.isVatId === 'boolean') {
        isVatIdMock = options.isVatId;
      }
    },
  };
};
