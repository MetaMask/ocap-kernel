import { S } from '@metamask/kernel-utils';
import { describe, it, expect } from 'vitest';

import { makeEvaluator } from './evaluator.ts';
import { AssistantMessage, CapabilityResultMessage } from './messages.ts';
import { makeMethodCapability } from '../../../test/make-method-capability.ts';

describe('invokeCapabilities', () => {
  it("invokes the assistant's chosen capability", async () => {
    const testCapability = makeMethodCapability(
      'Test',
      'testCapability',
      async () => Promise.resolve('test'),
      S.method('a test capability', [], S.string()),
    );
    const evaluator = makeEvaluator({ capabilities: { testCapability } });
    const result = await evaluator(
      [],
      new AssistantMessage({ invoke: [{ name: 'testCapability', args: {} }] }),
    );
    expect(result).toStrictEqual(
      new CapabilityResultMessage([
        { name: 'testCapability', args: {}, result: 'test' },
      ]),
    );
  });

  it('throws if the capability is not found', async () => {
    const evaluator = makeEvaluator({ capabilities: {} });
    await expect(
      evaluator(
        [],
        new AssistantMessage({
          invoke: [{ name: 'testCapability', args: {} }],
        }),
      ),
    ).rejects.toThrow('Invoked capability testCapability not found');
  });
});
