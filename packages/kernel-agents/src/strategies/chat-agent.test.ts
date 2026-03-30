import '@ocap/repo-tools/test-utils/mock-endoify';

import { describe, expect, it, vi } from 'vitest';

import { makeChatAgent } from './chat-agent.ts';
import type { BoundChat } from './chat-agent.ts';
import { capability } from '../capabilities/capability.ts';

const makeChat = (responses: string[]): BoundChat => {
  let call = 0;
  return async () => {
    const index = call;
    call += 1;
    return {
      id: String(index),
      model: 'test',
      choices: [
        {
          message: {
            role: 'assistant' as const,
            content: responses[index] ?? '',
          },
          index: 0,
          finish_reason: 'stop',
        },
      ],
      usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
    };
  };
};

const noCapabilities = {};

describe('makeChatAgent', () => {
  it('returns plain text response when model does not invoke a capability', async () => {
    const chat = makeChat(['Hello, world!']);
    const agent = makeChatAgent({ chat, capabilities: noCapabilities });

    const result = await agent.task('say hello');
    expect(result).toBe('Hello, world!');
  });

  it('returns result when model invokes end capability', async () => {
    const chat = makeChat([
      '{"name": "end", "args": {"final": "the answer is 42"}}',
    ]);
    const agent = makeChatAgent({ chat, capabilities: noCapabilities });

    const result = await agent.task('what is the answer?');
    expect(result).toBe('the answer is 42');
  });

  it('dispatches a user capability and continues to end', async () => {
    const add = vi.fn(async ({ a, b }: { a: number; b: number }) => a + b);
    const addCap = capability(add, {
      description: 'Add two numbers',
      args: {
        a: { type: 'number' },
        b: { type: 'number' },
      },
      returns: { type: 'number' },
    });

    const chat = makeChat([
      '{"name": "add", "args": {"a": 3, "b": 4}}',
      '{"name": "end", "args": {"final": "7"}}',
    ]);
    const agent = makeChatAgent({
      chat,
      capabilities: { add: addCap },
    });

    const result = await agent.task('add 3 and 4');
    expect(add).toHaveBeenCalledWith({ a: 3, b: 4 });
    expect(result).toBe('7');
  });

  it('injects tool result into messages before next turn', async () => {
    const messages: string[][] = [];
    const chat: BoundChat = async (chatMsgs) => {
      messages.push(chatMsgs.map((chatMsg) => chatMsg.content));
      const turn = messages.length - 1;
      return {
        id: String(turn),
        model: 'test',
        choices: [
          {
            message: {
              role: 'assistant' as const,
              content:
                turn === 0
                  ? '{"name": "ping", "args": {}}'
                  : '{"name": "end", "args": {"final": "done"}}',
            },
            index: 0,
            finish_reason: 'stop',
          },
        ],
        usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
      };
    };

    const ping = capability(async () => 'pong', {
      description: 'Ping',
      args: {},
      returns: { type: 'string' },
    });
    const agent = makeChatAgent({ chat, capabilities: { ping } });
    await agent.task('ping');

    // Second turn messages should include the tool result
    expect(
      messages[1]?.some((content) => content.includes('[Result of ping]')),
    ).toBe(true);
  });

  it('appends error message for unknown capability and continues', async () => {
    const chat = makeChat([
      '{"name": "nonexistent", "args": {}}',
      '{"name": "end", "args": {"final": "recovered"}}',
    ]);
    const agent = makeChatAgent({ chat, capabilities: noCapabilities });

    const result = await agent.task('do something');
    expect(result).toBe('recovered');
  });

  it('throws when invocation budget is exceeded', async () => {
    // Always invokes a capability but never ends
    const ping = capability(async () => 'pong', {
      description: 'Ping',
      args: {},
    });
    const neverEnd = makeChat(
      Array.from({ length: 20 }, () => '{"name": "ping", "args": {}}'),
    );
    const agent = makeChatAgent({
      chat: neverEnd,
      capabilities: { ping },
    });

    await expect(
      agent.task('go', undefined, { invocationBudget: 3 }),
    ).rejects.toThrow('Invocation budget exceeded');
  });

  it('applies judgment to end result', async () => {
    const chat = makeChat(['{"name": "end", "args": {"final": 99}}']);
    const agent = makeChatAgent({ chat, capabilities: noCapabilities });

    const isString = (result: unknown): result is string =>
      typeof result === 'string';
    await expect(agent.task('go', isString)).rejects.toThrow('Invalid result');
  });

  it('accumulates experiences across tasks', async () => {
    const chat = makeChat(['hello', 'world']);
    const agent = makeChatAgent({ chat, capabilities: noCapabilities });

    await agent.task('first');
    await agent.task('second');

    const exps = [];
    for await (const exp of agent.experiences) {
      exps.push(exp);
    }
    expect(exps).toHaveLength(2);
    expect(exps[0]?.objective.intent).toBe('first');
    expect(exps[1]?.objective.intent).toBe('second');
  });
});
