import EventEmitter from 'node:events';
import type { Socket } from 'node:net';
import { vi, describe, it, expect } from 'vitest';

import { readLine, writeLine } from './socket-line.ts';

/**
 * Create a minimal mock socket backed by an EventEmitter.
 *
 * @returns A mock socket with a spied `write` and `removeListener`.
 */
function makeMockSocket(): Socket {
  const emitter = new EventEmitter();
  const socket = emitter as unknown as Socket;

  socket.write = vi.fn(
    (_data: string, done?: (error?: Error | null) => void) => {
      done?.();
      return true;
    },
  ) as Socket['write'];
  vi.spyOn(emitter, 'removeListener');
  return socket;
}

describe('writeLine', () => {
  it('writes data with a trailing newline', async () => {
    const socket = makeMockSocket();
    await writeLine(socket, 'hello');
    expect(socket.write).toHaveBeenCalledWith('hello\n', expect.any(Function));
  });

  it('rejects when write fails', async () => {
    const socket = makeMockSocket();

    socket.write = vi.fn(
      (_data: string, done?: (error?: Error | null) => void) => {
        done?.(new Error('write failed'));
        return false;
      },
    ) as Socket['write'];
    await expect(writeLine(socket, 'hello')).rejects.toThrow('write failed');
  });
});

describe('readLine', () => {
  it('resolves with a complete line', async () => {
    const socket = makeMockSocket();
    const promise = readLine(socket);
    socket.emit('data', Buffer.from('hello\n'));
    expect(await promise).toBe('hello');
  });

  it('buffers partial data until newline arrives', async () => {
    const socket = makeMockSocket();
    const promise = readLine(socket);
    socket.emit('data', Buffer.from('hel'));
    socket.emit('data', Buffer.from('lo\n'));
    expect(await promise).toBe('hello');
  });

  it('returns only the first line when multiple lines arrive', async () => {
    const socket = makeMockSocket();
    const promise = readLine(socket);
    socket.emit('data', Buffer.from('first\nsecond\n'));
    expect(await promise).toBe('first');
  });

  it('rejects on socket error', async () => {
    const socket = makeMockSocket();
    const promise = readLine(socket);
    socket.emit('error', new Error('connection reset'));
    await expect(promise).rejects.toThrow('connection reset');
  });

  it('rejects on socket end', async () => {
    const socket = makeMockSocket();
    const promise = readLine(socket);
    socket.emit('end');
    await expect(promise).rejects.toThrow(
      'Socket closed before response received',
    );
  });

  it('rejects on socket close', async () => {
    const socket = makeMockSocket();
    const promise = readLine(socket);
    socket.emit('close');
    await expect(promise).rejects.toThrow(
      'Socket closed before response received',
    );
  });

  it('rejects on timeout', async () => {
    const socket = makeMockSocket();
    const promise = readLine(socket, 50);
    await expect(promise).rejects.toThrow('Socket read timed out');
  });

  it('does not time out if data arrives before deadline', async () => {
    const socket = makeMockSocket();
    const promise = readLine(socket, 5_000);
    socket.emit('data', Buffer.from('fast\n'));
    expect(await promise).toBe('fast');
  });

  it('removes only its own listeners on success', async () => {
    const socket = makeMockSocket();
    const externalListener = vi.fn();
    socket.on('data', externalListener);

    const promise = readLine(socket);
    socket.emit('data', Buffer.from('line\n'));
    await promise;

    expect(socket.listenerCount('data')).toBe(1);
    expect(socket.listeners('data')).toContain(externalListener);
  });

  it('removes only its own listeners on error', async () => {
    const socket = makeMockSocket();
    const externalListener = vi.fn();
    socket.on('error', externalListener);

    const promise = readLine(socket);
    socket.emit('error', new Error('boom'));
    await promise.catch(() => undefined);

    expect(socket.listenerCount('error')).toBe(1);
    expect(socket.listeners('error')).toContain(externalListener);
  });

  it('removes only its own listeners on timeout', async () => {
    const socket = makeMockSocket();
    const externalListener = vi.fn();
    socket.on('data', externalListener);

    const promise = readLine(socket, 50);
    await promise.catch(() => undefined);

    expect(socket.listenerCount('data')).toBe(1);
    expect(socket.listeners('data')).toContain(externalListener);
  });
});
