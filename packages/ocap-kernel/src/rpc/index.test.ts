import { describe, it, expect } from 'vitest';

import * as indexModule from './index.ts';

describe('index', () => {
  it('has the expected exports', () => {
    expect(Object.keys(indexModule).sort()).toStrictEqual([
      'kernelHandlers',
      'kernelMethodSpecs',
      'kernelRemoteHandlers',
      'kernelRemoteMethodSpecs',
      'platformServicesHandlers',
      'platformServicesMethodSpecs',
      'vatHandlers',
      'vatMethodSpecs',
      'vatSyscallHandlers',
      'vatSyscallMethodSpecs',
    ]);
  });
});
