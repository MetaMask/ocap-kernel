import '@ocap/repo-tools/test-utils/mock-endoify';

import type {
  ChatMessage,
  ChatResult,
  ToolCall,
} from '@ocap/kernel-language-model-service';
import { describe, expect, it, vi } from 'vitest';

import { makeChatAgent } from './chat-agent.ts';
import type { BoundChat } from './chat-agent.ts';
import { capability } from '../capabilities/capability.ts';

const makeToolCall = (
  id: string,
  name: string,
  args: Record<string, unknown>,
): ToolCall => ({
  id,
  type: 'function',
  function: { name, arguments: JSON.stringify(args) },
});

const makeTextResponse = (content: string): ChatResult => ({
  id: '0',
  model: 'test',
  choices: [
    {
      message: { role: 'assistant', content },
      index: 0,
      finish_reason: 'stop',
    },
  ],
  usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
});

const makeToolCallResponse = (
  id: string,
  toolCalls: ToolCall[],
): ChatResult => ({
  id,
  model: 'test',
  choices: [
    {
      message: { role: 'assistant', content: '', tool_calls: toolCalls },
      index: 0,
      finish_reason: 'tool_calls',
    },
  ],
  usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
});

const noCapabilities = {};

describe('makeChatAgent', () => {
  it('returns plain text response when model does not invoke a tool', async () => {
    const chat: BoundChat = async () => makeTextResponse('Hello, world!');
    const agent = makeChatAgent({ chat, capabilities: noCapabilities });

    const result = await agent.task('say hello');
    expect(result).toBe('Hello, world!');
  });

  it('dispatches a tool call and returns final text answer', async () => {
    const add = vi.fn(async ({ a, b }: { a: number; b: number }) => a + b);
    const addCap = capability(add, {
      description: 'Add two numbers',
      args: {
        a: { type: 'number' },
        b: { type: 'number' },
      },
      returns: { type: 'number' },
    });

    let call = 0;
    const chat: BoundChat = async () => {
      call += 1;
      if (call === 1) {
        return makeToolCallResponse('0', [
          makeToolCall('c1', 'add', { a: 3, b: 4 }),
        ]);
      }
      return makeTextResponse('7');
    };

    const agent = makeChatAgent({ chat, capabilities: { add: addCap } });

    const result = await agent.task('add 3 and 4');
    expect(add).toHaveBeenCalledWith({ a: 3, b: 4 });
    expect(result).toBe('7');
  });

  it('injects tool result message before next turn', async () => {
    const recorded: ChatMessage[][] = [];
    const ping = capability(async () => 'pong', {
      description: 'Ping',
      args: {},
      returns: { type: 'string' },
    });

    let call = 0;
    const chat: BoundChat = async ({ messages }) => {
      recorded.push([...messages]);
      call += 1;
      if (call === 1) {
        return makeToolCallResponse('0', [makeToolCall('c1', 'ping', {})]);
      }
      return makeTextResponse('done');
    };

    const agent = makeChatAgent({ chat, capabilities: { ping } });
    await agent.task('ping');

    // Second turn must include the tool result message
    const secondTurn = recorded[1] ?? [];
    expect(
      secondTurn.some(
        (message) => message.role === 'tool' && message.tool_call_id === 'c1',
      ),
    ).toBe(true);
    expect(secondTurn.some((message) => message.content === '"pong"')).toBe(
      true,
    );
  });

  it('injects error message for unknown tool and continues', async () => {
    const recorded: ChatMessage[][] = [];
    let call = 0;
    const chat: BoundChat = async ({ messages }) => {
      recorded.push([...messages]);
      call += 1;
      if (call === 1) {
        return makeToolCallResponse('0', [
          makeToolCall('c1', 'nonexistent', {}),
        ]);
      }
      return makeTextResponse('recovered');
    };

    const agent = makeChatAgent({ chat, capabilities: noCapabilities });
    const result = await agent.task('do something');

    expect(result).toBe('recovered');
    const secondTurn = recorded[1] ?? [];
    expect(
      secondTurn.some(
        (message) =>
          message.role === 'tool' &&
          message.content.includes('Unknown capability'),
      ),
    ).toBe(true);
  });

  it('throws when invocation budget is exceeded', async () => {
    const ping = capability(async () => 'pong', {
      description: 'Ping',
      args: {},
    });
    const chat: BoundChat = async () =>
      makeToolCallResponse('0', [makeToolCall('c1', 'ping', {})]);

    const agent = makeChatAgent({ chat, capabilities: { ping } });

    await expect(
      agent.task('go', undefined, { invocationBudget: 3 }),
    ).rejects.toThrow('Invocation budget exceeded');
  });

  it('applies judgment to final answer', async () => {
    const chat: BoundChat = async () => makeTextResponse('hello');
    const agent = makeChatAgent({ chat, capabilities: noCapabilities });

    const isNumber = (result: unknown): result is number =>
      typeof result === 'number';
    await expect(agent.task('go', isNumber)).rejects.toThrow('Invalid result');
  });

  it('passes tools to the chat function', async () => {
    const recordedTools: unknown[] = [];
    const ping = capability(async () => 'pong', {
      description: 'Ping the server',
      args: {},
      returns: { type: 'string' },
    });

    const chat: BoundChat = async ({ tools }) => {
      recordedTools.push(tools);
      return makeTextResponse('done');
    };

    const agent = makeChatAgent({ chat, capabilities: { ping } });
    await agent.task('go');

    expect(recordedTools[0]).toStrictEqual([
      {
        type: 'function',
        function: {
          name: 'ping',
          description: 'Ping the server',
          parameters: { type: 'object', properties: {}, required: [] },
        },
      },
    ]);
  });

  it('passes undefined tools when there are no capabilities', async () => {
    let recordedTools: unknown = 'not-set';
    const chat: BoundChat = async ({ tools }) => {
      recordedTools = tools;
      return makeTextResponse('done');
    };

    const agent = makeChatAgent({ chat, capabilities: noCapabilities });
    await agent.task('go');

    expect(recordedTools).toBeUndefined();
  });

  it('accumulates experiences across tasks', async () => {
    let call = 0;
    const responses = ['hello', 'world'];
    const chat: BoundChat = async () => {
      const response = makeTextResponse(responses[call] ?? '');
      call += 1;
      return response;
    };
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
