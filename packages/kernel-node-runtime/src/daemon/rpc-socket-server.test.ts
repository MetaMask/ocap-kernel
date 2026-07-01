import { createConnection } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { vi, describe, it, expect, afterEach } from 'vitest';

import type { RpcSocketServerHandle } from './rpc-socket-server.ts';
import type { Session, SessionRegistry } from './session-registry.ts';

// Mock @metamask/kernel-rpc-methods and @metamask/ocap-kernel/rpc so no real
// kernel initialisation occurs. The factory must be self-contained (no outer
// references) because vi.mock factories are hoisted before other imports.
vi.mock('@metamask/kernel-rpc-methods', () => {
  class MockRpcService {
    assertHasMethod = vi.fn();

    execute = vi.fn().mockResolvedValue(null);
  }
  return { RpcService: MockRpcService };
});

vi.mock('@metamask/ocap-kernel/rpc', () => ({
  rpcHandlers: {},
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type JsonRpcResponse = {
  jsonrpc: string;
  id: number;
  result?: unknown;
  error?: { code: number; message: string };
};

async function sendRequest(
  socketPath: string,
  method: string,
  params: Record<string, unknown> = {},
): Promise<JsonRpcResponse> {
  return new Promise((resolve, reject) => {
    const socket = createConnection(socketPath, () => {
      const request = JSON.stringify({ jsonrpc: '2.0', id: 1, method, params });
      socket.write(`${request}\n`);
    });

    let buffer = '';
    socket.on('data', (chunk: Buffer) => {
      buffer += chunk.toString();
    });
    socket.on('end', () => {
      try {
        resolve(JSON.parse(buffer.trim()) as JsonRpcResponse);
      } catch (parseError) {
        reject(parseError);
      }
    });
    socket.on('error', reject);
  });
}

function makeTestSession(overrides: Partial<Session> = {}): Session {
  const startedAt = overrides.startedAt ?? '2026-01-01T00:00:00.000Z';
  return {
    sessionId: 'alice',
    ocapUrl: 'ocap://test-url',
    startedAt,
    lastActiveAt: vi.fn().mockReturnValue(startedAt),
    listPending: vi.fn().mockReturnValue([]),
    listHistory: vi.fn().mockReturnValue([]),
    decide: vi.fn(),
    queueRequest: vi.fn().mockReturnValue('req-0'),
    authorizeRequest: vi.fn().mockResolvedValue({
      token: 'req-0',
      verdict: 'accept' as const,
      feedback: '',
    }),
    recordProvisioned: vi.fn(),
    subscribe: vi.fn(),
    ...overrides,
  };
}

function makeTestRegistry(
  initial: Session[] = [],
): SessionRegistry & { _sessions: Map<string, Session> } {
  const sessions = new Map<string, Session>(
    initial.map((session) => [session.sessionId, session]),
  );
  let nameIndex = 0;
  const names = ['alice', 'bob', 'carol'];

  return {
    _sessions: sessions,
    async createSession(
      options: { name?: string; cwd?: string } = {},
    ): Promise<Session> {
      const sessionId =
        options.name ?? names[nameIndex] ?? `session-${nameIndex}`;
      nameIndex += 1;
      const session = makeTestSession({
        sessionId,
        ocapUrl: `ocap://${sessionId}`,
        startedAt: '2026-01-01T00:00:00.000Z',
        ...(options.cwd === undefined ? {} : { cwd: options.cwd }),
      });
      sessions.set(sessionId, session);
      return session;
    },
    getSession(sessionId: string): Session | undefined {
      return sessions.get(sessionId);
    },
    listSessions(): Session[] {
      return Array.from(sessions.values());
    },
    getChannelByUrl(_url: string) {
      return undefined;
    },
  };
}

function makeSocketPath(): string {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return join(tmpdir(), `rpc-server-test-${suffix}.sock`);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('startRpcSocketServer — session.* methods', () => {
  let handle: RpcSocketServerHandle | undefined;

  afterEach(async () => {
    if (handle) {
      const toClose = handle;
      handle = undefined;
      await toClose.close();
    }
    vi.clearAllMocks();
  });

  it('session.create response includes sessionId, ocapUrl, startedAt, lastActiveAt', async () => {
    const { startRpcSocketServer } = await import('./rpc-socket-server.ts');
    const socketPath = makeSocketPath();
    const registry = makeTestRegistry();

    handle = await startRpcSocketServer({
      socketPath,
      kernel: {} as never,
      kernelDatabase: { executeQuery: vi.fn() } as never,
      channelFactory: {} as never,
      sessionRegistry: registry,
    });

    const response = await sendRequest(socketPath, 'session.create', {});

    expect(response.result).toStrictEqual({
      sessionId: 'alice',
      ocapUrl: 'ocap://alice',
      startedAt: '2026-01-01T00:00:00.000Z',
      lastActiveAt: '2026-01-01T00:00:00.000Z',
    });
  });

  it('session.create with cwd param includes cwd in response', async () => {
    const { startRpcSocketServer } = await import('./rpc-socket-server.ts');
    const socketPath = makeSocketPath();
    const registry = makeTestRegistry();

    handle = await startRpcSocketServer({
      socketPath,
      kernel: {} as never,
      kernelDatabase: { executeQuery: vi.fn() } as never,
      channelFactory: {} as never,
      sessionRegistry: registry,
    });

    const response = await sendRequest(socketPath, 'session.create', {
      cwd: '/home/user',
    });

    expect(response.result).toStrictEqual({
      sessionId: 'alice',
      ocapUrl: 'ocap://alice',
      cwd: '/home/user',
      startedAt: '2026-01-01T00:00:00.000Z',
      lastActiveAt: '2026-01-01T00:00:00.000Z',
    });
  });

  it('session.create without cwd param omits cwd from response', async () => {
    const { startRpcSocketServer } = await import('./rpc-socket-server.ts');
    const socketPath = makeSocketPath();
    const registry = makeTestRegistry();

    handle = await startRpcSocketServer({
      socketPath,
      kernel: {} as never,
      kernelDatabase: { executeQuery: vi.fn() } as never,
      channelFactory: {} as never,
      sessionRegistry: registry,
    });

    const response = await sendRequest(socketPath, 'session.create', {});

    expect(response.result).not.toHaveProperty('cwd');
  });

  it('session.list returns sessions with sessionId, ocapUrl, startedAt, lastActiveAt', async () => {
    const { startRpcSocketServer } = await import('./rpc-socket-server.ts');
    const socketPath = makeSocketPath();
    const existing = makeTestSession({
      sessionId: 'alice',
      ocapUrl: 'ocap://alice',
      startedAt: '2026-01-01T00:00:00.000Z',
      lastActiveAt: vi.fn().mockReturnValue('2026-01-02T00:00:00.000Z'),
    });
    const registry = makeTestRegistry([existing]);

    handle = await startRpcSocketServer({
      socketPath,
      kernel: {} as never,
      kernelDatabase: { executeQuery: vi.fn() } as never,
      channelFactory: {} as never,
      sessionRegistry: registry,
    });

    const response = await sendRequest(socketPath, 'session.list', {});

    expect(response.result).toStrictEqual([
      {
        sessionId: 'alice',
        ocapUrl: 'ocap://alice',
        startedAt: '2026-01-01T00:00:00.000Z',
        lastActiveAt: '2026-01-02T00:00:00.000Z',
      },
    ]);
  });

  it('session.get returns session with sessionId, ocapUrl, startedAt, lastActiveAt', async () => {
    const { startRpcSocketServer } = await import('./rpc-socket-server.ts');
    const socketPath = makeSocketPath();
    const existing = makeTestSession({
      sessionId: 'alice',
      ocapUrl: 'ocap://alice',
      startedAt: '2026-01-01T00:00:00.000Z',
    });
    const registry = makeTestRegistry([existing]);

    handle = await startRpcSocketServer({
      socketPath,
      kernel: {} as never,
      kernelDatabase: { executeQuery: vi.fn() } as never,
      channelFactory: {} as never,
      sessionRegistry: registry,
    });

    const response = await sendRequest(socketPath, 'session.get', {
      sessionId: 'alice',
    });

    expect(response.result).toStrictEqual({
      sessionId: 'alice',
      ocapUrl: 'ocap://alice',
      startedAt: '2026-01-01T00:00:00.000Z',
      lastActiveAt: '2026-01-01T00:00:00.000Z',
    });
  });

  it('session.get with unknown sessionId returns error code -32602', async () => {
    const { startRpcSocketServer } = await import('./rpc-socket-server.ts');
    const socketPath = makeSocketPath();
    const registry = makeTestRegistry();

    handle = await startRpcSocketServer({
      socketPath,
      kernel: {} as never,
      kernelDatabase: { executeQuery: vi.fn() } as never,
      channelFactory: {} as never,
      sessionRegistry: registry,
    });

    const response = await sendRequest(socketPath, 'session.get', {
      sessionId: 'nonexistent',
    });

    expect(response.error).toStrictEqual({
      code: -32602,
      message: 'Session not found: nonexistent',
    });
  });

  it('session.history returns listHistory() result for an existing session', async () => {
    const { startRpcSocketServer } = await import('./rpc-socket-server.ts');
    const socketPath = makeSocketPath();
    const historyEntries = [
      {
        token: 'req-0',
        description: 'Test request',
        reason: 'Testing',
        guard: { body: '#{}', slots: [] as string[] },
        queuedAt: '2026-01-01T00:01:00.000Z',
        status: 'accepted' as const,
        decidedAt: '2026-01-01T00:01:05.000Z',
      },
    ];
    const existing = makeTestSession({
      sessionId: 'alice',
      ocapUrl: 'ocap://alice',
      startedAt: '2026-01-01T00:00:00.000Z',
      listHistory: vi.fn().mockReturnValue(historyEntries),
    });
    const registry = makeTestRegistry([existing]);

    handle = await startRpcSocketServer({
      socketPath,
      kernel: {} as never,
      kernelDatabase: { executeQuery: vi.fn() } as never,
      channelFactory: {} as never,
      sessionRegistry: registry,
    });

    const response = await sendRequest(socketPath, 'session.history', {
      sessionId: 'alice',
    });

    expect(response.result).toStrictEqual(historyEntries);
  });

  it('session.history with unknown sessionId returns error code -32602', async () => {
    const { startRpcSocketServer } = await import('./rpc-socket-server.ts');
    const socketPath = makeSocketPath();
    const registry = makeTestRegistry();

    handle = await startRpcSocketServer({
      socketPath,
      kernel: {} as never,
      kernelDatabase: { executeQuery: vi.fn() } as never,
      channelFactory: {} as never,
      sessionRegistry: registry,
    });

    const response = await sendRequest(socketPath, 'session.history', {
      sessionId: 'unknown-session',
    });

    expect(response.error).toStrictEqual({
      code: -32602,
      message: 'Session not found: unknown-session',
    });
  });

  it('session.record calls recordProvisioned with description and invocations', async () => {
    const { startRpcSocketServer } = await import('./rpc-socket-server.ts');
    const socketPath = makeSocketPath();
    const existing = makeTestSession({
      sessionId: 'alice',
      ocapUrl: 'ocap://alice',
      startedAt: '2026-01-01T00:00:00.000Z',
    });
    const registry = makeTestRegistry([existing]);

    handle = await startRpcSocketServer({
      socketPath,
      kernel: {} as never,
      kernelDatabase: { executeQuery: vi.fn() } as never,
      channelFactory: {} as never,
      sessionRegistry: registry,
    });

    const invocations = [{ name: 'git', argv: ['status'] }];
    const provisions = [
      {
        tool: 'Bash',
        patterns: [
          {
            name: 'git',
            argPatterns: [{ kind: 'exact', value: 'status' }],
          },
        ],
      },
    ];
    const response = await sendRequest(socketPath, 'session.record', {
      sessionId: 'alice',
      description: 'Allow Bash({"command":"git status"})',
      invocations,
      provisions,
    });

    expect(response.result).toBeNull();
    expect(existing.recordProvisioned).toHaveBeenCalledWith(
      'Allow Bash({"command":"git status"})',
      { invocations, provisions },
    );
  });

  it('session.authorize returns the decision from authorizeRequest()', async () => {
    const { startRpcSocketServer } = await import('./rpc-socket-server.ts');
    const socketPath = makeSocketPath();
    const decision = {
      token: 'req-0',
      verdict: 'accept' as const,
      feedback: 'Looks good',
    };
    const existing = makeTestSession({
      sessionId: 'alice',
      ocapUrl: 'ocap://alice',
      startedAt: '2026-01-01T00:00:00.000Z',
      authorizeRequest: vi.fn().mockResolvedValue(decision),
    });
    const registry = makeTestRegistry([existing]);

    handle = await startRpcSocketServer({
      socketPath,
      kernel: {} as never,
      kernelDatabase: { executeQuery: vi.fn() } as never,
      channelFactory: {} as never,
      sessionRegistry: registry,
    });

    const response = await sendRequest(socketPath, 'session.authorize', {
      sessionId: 'alice',
      description: 'Allow read access',
      reason: 'Needed for operation',
    });

    expect(response.result).toStrictEqual(decision);
    expect(existing.authorizeRequest).toHaveBeenCalledWith(
      'Allow read access',
      { reason: 'Needed for operation' },
    );
  });

  it('session.decide calls decide() with parsed params on the happy path', async () => {
    const { startRpcSocketServer } = await import('./rpc-socket-server.ts');
    const socketPath = makeSocketPath();
    const existing = makeTestSession({
      sessionId: 'alice',
      ocapUrl: 'ocap://alice',
      startedAt: '2026-01-01T00:00:00.000Z',
    });
    const registry = makeTestRegistry([existing]);

    handle = await startRpcSocketServer({
      socketPath,
      kernel: {} as never,
      kernelDatabase: { executeQuery: vi.fn() } as never,
      channelFactory: {} as never,
      sessionRegistry: registry,
    });

    const guard = { body: '#{}', slots: [] as string[] };
    const provisions = [
      {
        tool: 'Bash',
        patterns: [
          {
            name: 'git',
            argPatterns: [{ kind: 'exact', value: 'status' }],
          },
        ],
      },
    ];
    const response = await sendRequest(socketPath, 'session.decide', {
      sessionId: 'alice',
      token: 'req-0',
      verdict: 'accept',
      feedback: 'ok',
      guard,
      provisions,
    });

    expect(response.result).toBeNull();
    expect(existing.decide).toHaveBeenCalledWith({
      token: 'req-0',
      verdict: 'accept',
      feedback: 'ok',
      guard,
      provisions,
    });
  });

  it.each([
    {
      label: 'session.authorize rejects malformed invocations',
      method: 'session.authorize',
      params: {
        sessionId: 'alice',
        description: 'desc',
        invocations: [{ name: 'git' }],
      },
    },
    {
      label: 'session.record rejects malformed invocations',
      method: 'session.record',
      params: {
        sessionId: 'alice',
        description: 'desc',
        invocations: [{ argv: ['status'] }],
      },
    },
    {
      label: 'session.record rejects malformed provisions',
      method: 'session.record',
      params: {
        sessionId: 'alice',
        description: 'desc',
        provisions: [{ tool: 'Bash' }],
      },
    },
    {
      label: 'session.decide rejects malformed guard',
      method: 'session.decide',
      params: {
        sessionId: 'alice',
        token: 'req-0',
        verdict: 'accept',
        guard: { body: 'x' },
      },
    },
    {
      label: 'session.decide rejects bad verdict',
      method: 'session.decide',
      params: {
        sessionId: 'alice',
        token: 'req-0',
        verdict: 'maybe',
      },
    },
    {
      label: 'session.decide rejects non-string token',
      method: 'session.decide',
      params: {
        sessionId: 'alice',
        token: 42,
        verdict: 'accept',
      },
    },
    {
      label: 'session.authorize rejects non-array clauses',
      method: 'session.authorize',
      params: {
        sessionId: 'alice',
        description: 'desc',
        clauses: 'not-an-array',
      },
    },
  ])('$label as -32602', async ({ method, params }) => {
    const { startRpcSocketServer } = await import('./rpc-socket-server.ts');
    const socketPath = makeSocketPath();
    const existing = makeTestSession({
      sessionId: 'alice',
      ocapUrl: 'ocap://alice',
      startedAt: '2026-01-01T00:00:00.000Z',
    });
    const registry = makeTestRegistry([existing]);

    handle = await startRpcSocketServer({
      socketPath,
      kernel: {} as never,
      kernelDatabase: { executeQuery: vi.fn() } as never,
      channelFactory: {} as never,
      sessionRegistry: registry,
    });

    const response = await sendRequest(socketPath, method, params);

    expect(response.error?.code).toBe(-32602);
    expect(response.error?.message).toMatch(method);
  });

  it('session.queue happy path queues request with description and reason', async () => {
    const { startRpcSocketServer } = await import('./rpc-socket-server.ts');
    const socketPath = makeSocketPath();
    const queueRequest = vi.fn().mockReturnValue('req-7');
    const existing = makeTestSession({
      sessionId: 'alice',
      ocapUrl: 'ocap://alice',
      startedAt: '2026-01-01T00:00:00.000Z',
      queueRequest,
    });
    const registry = makeTestRegistry([existing]);

    handle = await startRpcSocketServer({
      socketPath,
      kernel: {} as never,
      kernelDatabase: { executeQuery: vi.fn() } as never,
      channelFactory: {} as never,
      sessionRegistry: registry,
    });

    const response = await sendRequest(socketPath, 'session.queue', {
      sessionId: 'alice',
      description: 'My req',
      reason: 'because',
    });

    expect(response.result).toStrictEqual({ token: 'req-7' });
    expect(queueRequest).toHaveBeenCalledWith('My req', 'because');
  });

  it('session.requests returns listPending() for an existing session', async () => {
    const { startRpcSocketServer } = await import('./rpc-socket-server.ts');
    const socketPath = makeSocketPath();
    const pending = [{ token: 't-1', description: 'd', reason: 'r' }];
    const existing = makeTestSession({
      sessionId: 'alice',
      ocapUrl: 'ocap://alice',
      startedAt: '2026-01-01T00:00:00.000Z',
      listPending: vi.fn().mockReturnValue(pending),
    });
    const registry = makeTestRegistry([existing]);

    handle = await startRpcSocketServer({
      socketPath,
      kernel: {} as never,
      kernelDatabase: { executeQuery: vi.fn() } as never,
      channelFactory: {} as never,
      sessionRegistry: registry,
    });

    const response = await sendRequest(socketPath, 'session.requests', {
      sessionId: 'alice',
    });

    expect(response.result).toStrictEqual(pending);
  });

  it('session.get without sessionId returns -32602', async () => {
    const { startRpcSocketServer } = await import('./rpc-socket-server.ts');
    const socketPath = makeSocketPath();
    const registry = makeTestRegistry();

    handle = await startRpcSocketServer({
      socketPath,
      kernel: {} as never,
      kernelDatabase: { executeQuery: vi.fn() } as never,
      channelFactory: {} as never,
      sessionRegistry: registry,
    });

    const response = await sendRequest(socketPath, 'session.get', {});

    expect(response.error?.code).toBe(-32602);
  });
});
