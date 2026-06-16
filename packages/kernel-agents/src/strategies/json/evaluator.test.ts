import { describe, it, expect } from 'vitest';

import { makeEvaluator } from './evaluator.ts';
import { AssistantMessage, CapabilityResultMessage } from './messages.ts';
import { capability } from '../../capabilities/capability.ts';

describe('invokeCapabilities', () => {
  it("invokes the assistant's chosen capability", async () => {
    const testCapability = capability(async () => Promise.resolve('test'), {
      description: 'a test capability',
      args: { type: 'object', properties: {} },
    });
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

  it('throws when invocation args do not match the schema', async () => {
    let called = false;
    const add = capability<{ a: number; b: number }, number>(
      async ({ a, b }) => {
        called = true;
        return Promise.resolve(a + b);
      },
      {
        description: 'add',
        args: {
          type: 'object',
          properties: { a: { type: 'number' }, b: { type: 'number' } },
          required: ['a', 'b'],
        },
      },
    );
    const evaluator = makeEvaluator({ capabilities: { add } });
    await expect(
      evaluator(
        [],
        new AssistantMessage({
          invoke: [{ name: 'add', args: { a: 'nope', b: 2 } }],
        }),
      ),
    ).rejects.toThrow(/Expected a number/u);
    expect(called).toBe(false);
  });
});
