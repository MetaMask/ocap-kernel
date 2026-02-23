import { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import register from '../openclaw-plugin/index.ts';

vi.mock('node:child_process', () => ({ spawn: vi.fn() }));
vi.mock('@sinclair/typebox', () => ({
  Type: {
    Object: (shape: Record<string, unknown>) => shape,
    String: (_options?: Record<string, unknown>) => ({ type: 'string' }),
  },
}));

type ToolResponse = {
  content: { type: 'text'; text: string }[];
};

type ToolDefinition = {
  name: string;
  execute: (
    id: string,
    params?: Record<string, string>,
  ) => Promise<ToolResponse>;
};

type PluginApi = {
  pluginConfig?: Record<string, unknown>;
  registerTool: (tool: ToolDefinition, options: { optional: boolean }) => void;
};

type MockReadable = EventEmitter & {
  setEncoding: (encoding: string) => void;
};

/**
 * Encode a value as Endo CapData JSON.
 *
 * @param value - The value to encode.
 * @returns JSON string with `body` and `slots`.
 */
function makeCapData(value: unknown): string {
  return JSON.stringify({
    body: `#${JSON.stringify(value)}`,
    slots: [],
  });
}

/**
 * Create a readable-like event emitter used by child process stdio.
 *
 * @returns The mock readable.
 */
function makeReadable(): MockReadable {
  const stream = new EventEmitter() as MockReadable;
  stream.setEncoding = () => undefined;
  return stream;
}

/**
 * Create a mocked child process for spawn().
 *
 * @param options - Mock output options.
 * @param options.stdout - Text written to stdout.
 * @param options.stderr - Text written to stderr.
 * @param options.code - Exit code emitted with `exit`.
 * @returns A child process mock.
 */
function makeSpawnResult(options: {
  stdout?: string;
  stderr?: string;
  code?: number;
}): ReturnType<typeof spawn> {
  const child = new EventEmitter() as EventEmitter & {
    stdout: MockReadable;
    stderr: MockReadable;
    kill: (signal?: string) => boolean;
  };

  child.stdout = makeReadable();
  child.stderr = makeReadable();
  child.kill = () => true;
  vi.spyOn(child, 'kill').mockImplementation(() => true);

  queueMicrotask(() => {
    if (options.stdout) {
      child.stdout.emit('data', options.stdout);
    }
    if (options.stderr) {
      child.stderr.emit('data', options.stderr);
    }
    child.emit('exit', options.code ?? 0);
  });

  return child as unknown as ReturnType<typeof spawn>;
}

/**
 * Register the wallet plugin and return registered tools by name.
 *
 * @returns A map of tools.
 */
function setupPlugin(): Map<string, ToolDefinition> {
  const tools = new Map<string, ToolDefinition>();
  const api: PluginApi = {
    pluginConfig: {
      ocapCliPath: 'ocap',
      walletKref: 'ko4',
      timeoutMs: 5000,
    },
    registerTool: (tool) => {
      tools.set(tool.name, tool);
    },
  };

  register(api);
  return tools;
}

describe('openclaw wallet plugin', () => {
  const mockSpawn = vi.mocked(spawn);
  const account = '0x1111111111111111111111111111111111111111';
  const recipient = '0x2222222222222222222222222222222222222222';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('decodes CapData string response for wallet_balance', async () => {
    mockSpawn.mockImplementationOnce(() =>
      makeSpawnResult({ stdout: makeCapData('0xde0b6b3a7640000') }),
    );
    const tools = setupPlugin();
    const tool = tools.get('wallet_balance');
    expect(tool).toBeDefined();

    const result = await tool!.execute('req-1', { address: account });

    expect(result.content[0]?.text).toBe('0xde0b6b3a7640000');
  });

  it('decodes CapData object response for wallet_capabilities', async () => {
    const expected = {
      hasLocalKeys: true,
      localAccounts: [account],
      delegationCount: 1,
      hasPeerWallet: true,
      hasExternalSigner: false,
      hasBundlerConfig: true,
      smartAccountAddress: account,
    };
    mockSpawn.mockImplementationOnce(() =>
      makeSpawnResult({ stdout: makeCapData(expected) }),
    );

    const tools = setupPlugin();
    const tool = tools.get('wallet_capabilities');
    expect(tool).toBeDefined();

    const result = await tool!.execute('req-2');

    expect(JSON.parse(result.content[0]?.text ?? '{}')).toStrictEqual(expected);
  });

  it('infers from account before wallet_send', async () => {
    mockSpawn
      .mockImplementationOnce(() =>
        makeSpawnResult({ stdout: makeCapData([account]) }),
      )
      .mockImplementationOnce(() =>
        makeSpawnResult({ stdout: makeCapData('0xtxhash') }),
      );

    const tools = setupPlugin();
    const tool = tools.get('wallet_send');
    expect(tool).toBeDefined();

    const result = await tool!.execute('req-3', {
      to: recipient,
      value: '0x1',
    });

    expect(result.content[0]?.text).toBe('0xtxhash');
    expect(mockSpawn).toHaveBeenCalledTimes(2);

    const sendCallArgs = mockSpawn.mock.calls[1]?.[1];
    expect(Array.isArray(sendCallArgs)).toBe(true);
    const daemonArgs = sendCallArgs as string[];
    const payload = JSON.parse(daemonArgs[3] ?? 'null') as [
      string,
      string,
      unknown[],
    ];

    expect(payload).toStrictEqual([
      'ko4',
      'sendTransaction',
      [{ from: account, to: recipient, value: '0x1' }],
    ]);
  });

  it('returns error when wallet_send cannot infer a sender', async () => {
    mockSpawn.mockImplementationOnce(() =>
      makeSpawnResult({ stdout: makeCapData([]) }),
    );

    const tools = setupPlugin();
    const tool = tools.get('wallet_send');
    expect(tool).toBeDefined();

    const result = await tool!.execute('req-4', {
      to: recipient,
      value: '0x1',
    });

    expect(result.content[0]?.text).toBe(
      'Error: No wallet account available to use as sender.',
    );
    expect(mockSpawn).toHaveBeenCalledTimes(1);
  });

  it('does not spawn process for invalid wallet_send params', async () => {
    const tools = setupPlugin();
    const tool = tools.get('wallet_send');
    expect(tool).toBeDefined();

    const result = await tool!.execute('req-5', {
      to: 'not-an-address',
      value: '1',
    });

    expect(result.content[0]?.text).toBe(
      'Error: Invalid recipient address. Must be 0x followed by 40 hex characters.',
    );
    expect(mockSpawn).not.toHaveBeenCalled();
  });
});
