import { describe, it, expect } from 'vitest';

import * as indexModule from './index.ts';

describe('index', () => {
  it('has the expected exports', () => {
    expect(Object.keys(indexModule).sort()).toStrictEqual([
      'AllowedGlobalNameStruct',
      'CapDataStruct',
      'ClusterConfigStruct',
      'Kernel',
      'KernelStatusStruct',
      'SubclusterStruct',
      'VatConfigStruct',
      'VatHandle',
      'VatIdStruct',
      'VatSupervisor',
      'createDefaultEndowments',
      'generateMnemonic',
      'initTransport',
      'insistKRef',
      'insistSubclusterId',
      'isKRef',
      'isValidMnemonic',
      'isVatConfig',
      'isVatId',
      'krefOf',
      'kser',
      'kslot',
      'kunser',
      'makeKernelFacet',
      'makeKernelStore',
      'mnemonicToSeed',
      'parseRef',
    ]);
  });
});
