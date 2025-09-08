import {
  object,
  define,
  literal,
  string,
  boolean,
  record,
  exactOptional,
  array,
  type,
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
  vi.doMock('@metamask/ocap-kernel', () => {
    const VatIdStruct = define<unknown>('VatId', () => isVatIdMock);
    const VatConfigStruct = define<unknown>('VatConfig', () => isVatConfigMock);
    const SubclusterIdStruct = define<unknown>('SubclusterId', () => true);
    const ClusterConfigStruct = object({
      bootstrap: string(),
      forceReset: exactOptional(boolean()),
      vats: record(string(), VatConfigStruct),
      bundles: exactOptional(record(string(), VatConfigStruct)),
    });
    const SubclusterStruct = object({
      id: SubclusterIdStruct,
      config: ClusterConfigStruct,
      vats: array(VatIdStruct),
    });

    return {
      isVatId: () => isVatIdMock,
      isVatConfig: () => isVatConfigMock,
      VatIdStruct,
      VatConfigStruct,
      SubclusterIdStruct,
      SubclusterStruct,
      CapDataStruct: object({
        body: string(),
        slots: array(string()),
      }),
      ClusterConfigStruct,
      KernelStatusStruct: type({
        subclusters: array(SubclusterStruct),
        vats: array(
          object({
            id: VatIdStruct,
            config: VatConfigStruct,
            subclusterId: SubclusterIdStruct,
          }),
        ),
      }),
      KernelSendMessageStruct: object({
        id: literal('v0'),
        payload: object({
          method: literal('ping'),
          params: literal(null),
        }),
      }),
      PlatformServicesCommandMethod: {
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
