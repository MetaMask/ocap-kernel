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

let isVatConfigMock = true;
let isVatIdMock = true;

const VatIdStruct = define<unknown>('VatId', () => isVatIdMock);
const VatConfigStruct = define<unknown>('VatConfig', () => isVatConfigMock);

// Reset mock states to their default values
export const resetMocks = (): void => {
  isVatConfigMock = true;
  isVatIdMock = true;
};

// Allow external control of mock behaviors
export const setMockBehavior = (options: {
  isVatConfig?: boolean;
  isVatId?: boolean;
}): void => {
  if (typeof options.isVatConfig === 'boolean') {
    isVatConfigMock = options.isVatConfig;
  }
  if (typeof options.isVatId === 'boolean') {
    isVatIdMock = options.isVatId;
  }
};

// Mock implementation
export const mockOcapKernel = {
  isKernelCommand: () => true,
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

// Setup the mock
export const setupOcapKernelMock = (): void => {
  vi.mock('@ocap/kernel', () => mockOcapKernel);
};
