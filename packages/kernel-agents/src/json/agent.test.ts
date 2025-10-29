import '@ocap/repo-tools/test-utils/mock-endoify';

import type { Logger } from '@metamask/logger';
import { vi, describe, it, expect } from 'vitest';

import { makeAgent } from './agent.ts';
import { capability } from '../capability.ts';
import { AssistantMessage, CapabilityResultMessage } from './messages.ts';
import { makeChat } from './prompt.ts';

const prompt = 'test prompt';
const prefix = '{"messageType":"assistant","';

vi.mock('./prompt.ts', () => ({
  makeChat: vi.fn(() => ({
    getPromptAndPrefix: vi.fn(() => ({ prompt, prefix })),
    pushMessages: vi.fn(),
  })),
}));

describe('makeAgent', () => {
  const mockLlm = (...chunks: string[]) => ({
    getInfo: vi.fn(),
    load: vi.fn(),
    unload: vi.fn(),
    sample: vi.fn().mockResolvedValue({
      stream: {
        async *[Symbol.asyncIterator]() {
          for (const chunk of chunks) {
            yield { response: chunk };
          }
        },
      },
      abort: vi.fn(),
    }),
  });

  it('makes an agent', () => {
    const llm = mockLlm();
    const agent = makeAgent({ llm, capabilities: {} });
    expect(agent).toBeDefined();
    expect(agent).toHaveProperty('task');
  });

  describe('task', () => {
    it('invokes the LLM', async () => {
      const llm = mockLlm(`invoke":[{"name":"end","args":{"final":"x"}}]}`);
      const agent = makeAgent({ llm, capabilities: {} });
      const result = await agent.task('');
      expect(result).toBe('x');
      // This is a massive understatement, but we don't want to test the prompt
      expect(llm.sample).toHaveBeenCalledWith(prompt);
    });

    it('throws if the LLM did not invoke a capability', async () => {
      // LLM finishes valid JSON, but no invoke property
      const llm = mockLlm(`content":""}`);
      const agent = makeAgent({ llm, capabilities: {} });
      const task = agent.task('');
      await expect(task).rejects.toThrow('No invoke in result');
    });

    it('throws if invocation budget is exceeded', async () => {
      const llm = mockLlm(`invoke":[{"name":"end","args":{"final":"x"}}]}`);
      const agent = makeAgent({ llm, capabilities: {} });
      const task = agent.task('', { invocationBudget: 0 });
      await expect(task).rejects.toThrow('Invocation budget exceeded');
    });

    // XXX This test reflects a poor factorization of the agent.
    it('pushes messages to the transcript', async () => {
      const llm = mockLlm(`invoke":[{"name":"test","args":{}}]}`);
      const pushMessages = vi.fn();
      vi.mocked(makeChat).mockReturnValue({
        getPromptAndPrefix: vi.fn(() => ({ prompt, prefix })),
        pushMessages,
      });
      const { makeAgent: makeAgent2 } = await import('./agent.ts');
      const agent = makeAgent2({
        llm,
        capabilities: {
          test: capability(async () => 'test', {
            description: 'test',
            args: {},
            returns: { type: 'string' },
          }),
        },
      });
      const task = agent.task('test', { invocationBudget: 1 });
      await expect(task).rejects.toThrow('Invocation budget exceeded');
      expect(pushMessages).toHaveBeenCalledWith(
        expect.any(AssistantMessage),
        expect.any(CapabilityResultMessage),
      );
    });

    it('logs to the provided logger', async () => {
      const llm = mockLlm(`invoke":[{"name":"end","args":{"final":"x"}}]}`);
      const logger = {
        info: vi.fn(),
        subLogger: vi.fn(() => logger),
      } as unknown as Logger;
      const agent = makeAgent({ llm, capabilities: {}, logger });
      await agent.task('test', { invocationBudget: 1 });
      expect(logger.info).toHaveBeenCalledWith('query:', 'test');
      expect(logger.subLogger).toHaveBeenCalledWith({ tags: ['t001'] });
    });
  });
});
