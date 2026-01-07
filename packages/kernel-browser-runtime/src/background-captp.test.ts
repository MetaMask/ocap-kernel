import '@ocap/repo-tools/test-utils/mock-endoify';

import { describe, it, expect, vi, beforeEach } from 'vitest';

import {
  isCapTPNotification,
  getCapTPMessage,
  makeCapTPNotification,
  makeBackgroundCapTP,
} from './background-captp.ts';
import type { CapTPMessage, CapTPNotification } from './background-captp.ts';

describe('isCapTPNotification', () => {
  it('returns true for valid CapTP notification', () => {
    const notification = {
      jsonrpc: '2.0',
      method: 'captp',
      params: [{ type: 'foo' }],
    };
    expect(isCapTPNotification(notification)).toBe(true);
  });

  it('returns false when method is not "captp"', () => {
    const message = {
      jsonrpc: '2.0',
      method: 'other',
      params: [{ type: 'foo' }],
    };
    expect(isCapTPNotification(message)).toBe(false);
  });

  it('returns false when params is not an array', () => {
    const message = {
      jsonrpc: '2.0',
      method: 'captp',
      params: { type: 'foo' },
    };
    expect(isCapTPNotification(message as never)).toBe(false);
  });

  it('returns false when params is empty', () => {
    const message = {
      jsonrpc: '2.0',
      method: 'captp',
      params: [],
    };
    expect(isCapTPNotification(message)).toBe(false);
  });

  it('returns false when params has more than one element', () => {
    const message = {
      jsonrpc: '2.0',
      method: 'captp',
      params: [{ type: 'foo' }, { type: 'bar' }],
    };
    expect(isCapTPNotification(message)).toBe(false);
  });

  it('returns true for JSON-RPC request with id if it matches captp format', () => {
    // A request with an id is still a valid captp message format-wise
    const request = {
      jsonrpc: '2.0',
      id: 1,
      method: 'captp',
      params: [{ type: 'foo' }],
    };
    expect(isCapTPNotification(request)).toBe(true);
  });
});

describe('getCapTPMessage', () => {
  it('extracts CapTP message from valid notification', () => {
    const captpMessage: CapTPMessage = { type: 'CTP_CALL', methargs: [] };
    const notification: CapTPNotification = {
      jsonrpc: '2.0',
      method: 'captp',
      params: [captpMessage],
    };
    expect(getCapTPMessage(notification)).toStrictEqual(captpMessage);
  });

  it('throws for non-CapTP notification', () => {
    const message = {
      jsonrpc: '2.0',
      method: 'other',
      params: [],
    };
    expect(() => getCapTPMessage(message)).toThrow('Not a CapTP notification');
  });

  it('throws when params is empty', () => {
    const message = {
      jsonrpc: '2.0',
      method: 'captp',
      params: [],
    };
    expect(() => getCapTPMessage(message)).toThrow('Not a CapTP notification');
  });
});

describe('makeCapTPNotification', () => {
  it('wraps CapTP message in JSON-RPC notification', () => {
    const captpMessage: CapTPMessage = { type: 'CTP_CALL', target: 'ko1' };
    const result = makeCapTPNotification(captpMessage);

    expect(result).toStrictEqual({
      jsonrpc: '2.0',
      method: 'captp',
      params: [captpMessage],
    });
  });

  it('creates valid notification that passes isCapTPNotification', () => {
    const captpMessage: CapTPMessage = { type: 'CTP_RESOLVE' };
    const notification = makeCapTPNotification(captpMessage);

    expect(isCapTPNotification(notification)).toBe(true);
  });
});

describe('makeBackgroundCapTP', () => {
  let sendMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    sendMock = vi.fn();
  });

  it('returns object with dispatch, getKernel, and abort', () => {
    const capTP = makeBackgroundCapTP({ send: sendMock });

    expect(capTP).toHaveProperty('dispatch');
    expect(capTP).toHaveProperty('getKernel');
    expect(capTP).toHaveProperty('abort');
    expect(typeof capTP.dispatch).toBe('function');
    expect(typeof capTP.getKernel).toBe('function');
    expect(typeof capTP.abort).toBe('function');
  });

  it('getKernel returns a promise', () => {
    const capTP = makeBackgroundCapTP({ send: sendMock });
    const result = capTP.getKernel();

    expect(result).toBeInstanceOf(Promise);
  });

  it('calls send function when dispatching bootstrap request', () => {
    const capTP = makeBackgroundCapTP({ send: sendMock });

    // Calling getKernel triggers a bootstrap request (ignore unhandled promise)
    capTP.getKernel().catch(() => undefined);

    // CapTP should have sent a message to request bootstrap
    expect(sendMock).toHaveBeenCalled();
    const sentMessage = sendMock.mock.calls[0][0] as CapTPMessage;
    expect(sentMessage).toBeDefined();
  });

  it('dispatch returns boolean', () => {
    const capTP = makeBackgroundCapTP({ send: sendMock });

    // Dispatch a dummy message (will return false since it's not a valid CapTP message)
    const result = capTP.dispatch({ type: 'unknown' });

    expect(typeof result).toBe('boolean');
  });
});
