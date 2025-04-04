import { makeLogger } from '@ocap/utils';
import { describe, it, expect, vi } from 'vitest';

import { MessageResolver } from './message-resolver.ts';

describe('MessageResolver', () => {
  it('resolves the promise when handleResponse is called', async () => {
    const prefix = 'test';
    const resolver = new MessageResolver(prefix);

    const callback = vi.fn(async (messageId: string) => {
      // Simulate some asynchronous operation
      setTimeout(() => {
        resolver.handleResponse(messageId, 'response value');
      }, 10);
    });

    const promise = resolver.createMessage<string>(callback);
    const result = await promise;

    expect(result).toBe('response value');
    expect(callback).toHaveBeenCalled();
  });

  it('logs an error if handleResponse is called with an unknown messageId', () => {
    const prefix = 'test';

    // Create a real logger with mocked methods
    const mockLogger = makeLogger('[test-logger]');
    const errorSpy = vi
      .spyOn(mockLogger, 'error')
      .mockImplementation(() => undefined);

    const resolver = new MessageResolver(prefix, mockLogger);

    resolver.handleResponse('unknown-id', 'value');

    expect(errorSpy).toHaveBeenCalledOnce();
    expect(errorSpy.mock.lastCall).toContain(
      'No unresolved message with id "unknown-id".',
    );

    errorSpy.mockRestore();
  });

  it('generates unique message IDs', async () => {
    const prefix = 'test';
    const resolver = new MessageResolver(prefix);

    const messageIds: string[] = [];

    const callback1 = vi.fn(async (messageId: string) => {
      messageIds.push(messageId);
      resolver.handleResponse(messageId, 'response1');
    });

    const callback2 = vi.fn(async (messageId: string) => {
      messageIds.push(messageId);
      resolver.handleResponse(messageId, 'response2');
    });

    const promise1 = resolver.createMessage<string>(callback1);
    const promise2 = resolver.createMessage<string>(callback2);

    const result1 = await promise1;
    const result2 = await promise2;

    expect(result1).toBe('response1');
    expect(result2).toBe('response2');

    expect(messageIds).toHaveLength(2);
    expect(messageIds[0]).toBe(`${prefix}:1`);
    expect(messageIds[1]).toBe(`${prefix}:2`);
    expect(messageIds[0]).not.toBe(messageIds[1]);
  });

  it('rejects all pending messages with provided error', async () => {
    const resolver = new MessageResolver('test');
    const callback1 = vi.fn().mockResolvedValue(undefined);
    const callback2 = vi.fn().mockResolvedValue(undefined);

    const promise1 = resolver.createMessage(callback1);
    const promise2 = resolver.createMessage(callback2);

    const error = new Error('Termination error');
    resolver.terminateAll(error);

    await expect(promise1).rejects.toThrow(error);
    await expect(promise2).rejects.toThrow(error);
  });

  it('clears all unresolved messages after termination', () => {
    const resolver = new MessageResolver('test');
    const callback = vi.fn().mockResolvedValue(undefined);

    resolver.createMessage(callback).catch(vi.fn());
    resolver.createMessage(callback).catch(vi.fn());

    expect(resolver.unresolvedMessages.size).toBe(2);

    resolver.terminateAll(new Error('test'));

    expect(resolver.unresolvedMessages.size).toBe(0);
  });

  it('uses the parent logger when provided', () => {
    const parentLogger = makeLogger('[parent]');
    const loggerSpy = vi
      .spyOn(parentLogger, 'error')
      .mockImplementation(() => undefined);

    const resolver = new MessageResolver('test', parentLogger);
    resolver.handleResponse('unknown-id', 'value');

    expect(loggerSpy).toHaveBeenCalled();
    loggerSpy.mockRestore();
  });
});
