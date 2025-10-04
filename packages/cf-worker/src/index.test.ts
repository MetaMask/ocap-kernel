import { describe, expect, it } from 'vitest';

import { CfWorkerPlatformServices, makeCfWorkerVatSupervisor, makeKernel } from './index.ts';

describe('Exports', () => {
  it('exposes expected APIs', () => {
    expect(typeof CfWorkerPlatformServices).toBe('function');
    expect(typeof makeCfWorkerVatSupervisor).toBe('function');
    expect(typeof makeKernel).toBe('function');
  });
});
