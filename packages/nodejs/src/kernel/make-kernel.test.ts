import '@ocap/shims/endoify';

import { Kernel } from '@ocap/kernel';
import {
  MessagePort as NodeMessagePort,
  MessageChannel as NodeMessageChannel,
} from 'node:worker_threads';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { makeKernel } from './make-kernel.ts';

vi.mock('@ocap/store/sqlite/nodejs', async () => {
  const { makeMapKVStore } = await import('../../../kernel/test/storage.ts');
  return {
    makeSQLKVStore: makeMapKVStore,
  };
});

describe('makeKernel', () => {
  let kernelPort: NodeMessagePort;

  beforeEach(() => {
    kernelPort = new NodeMessageChannel().port1;
  });

  it('should return a Kernel', async () => {
    const kernel = await makeKernel({ port: kernelPort });

    expect(kernel).toBeInstanceOf(Kernel);
  });
});
