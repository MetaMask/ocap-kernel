import '@ocap/shims/endoify';

import { describe, expect, it } from 'vitest';

import { NodejsVatWorkerService } from './VatWorkerService.js';

describe('NodejsVatWorkerService', () => {
  it('constructs an instance without any arguments', () => {
    const instance = new NodejsVatWorkerService();
    expect(instance).toBeInstanceOf(NodejsVatWorkerService);
  });
});
