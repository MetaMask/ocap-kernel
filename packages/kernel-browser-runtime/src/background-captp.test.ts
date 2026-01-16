import type { JsonRpcNotification } from '@metamask/utils';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import {
  isCapTPNotification,
  getCapTPMessage,
  makeCapTPNotification,
  makeBackgroundCapTP,
} from './background-captp.ts';
import type { CapTPMessage } from './background-captp.ts';

const makeNotification = (
  params: CapTPMessage[],
  method = 'captp',
): JsonRpcNotification => ({
  jsonrpc: '2.0',
  method,
  params,
});

describe('isCapTPNotification', () => {
  it('returns true for valid CapTP notification', () => {
    const notification = makeNotification([{ type: 'foo' }]);
    expect(isCapTPNotification(notification)).toBe(true);
  });

  it('returns false when method is not "captp"', () => {
    const message = makeNotification([{ type: 'foo' }], 'other');
    expect(isCapTPNotification(message)).toBe(false);
  });

  it('returns false when params is not an array', () => {
    // @ts-expect-error - we want to test the error case
    const message = makeNotification({ type: 'foo' });
    expect(isCapTPNotification(message as never)).toBe(false);
  });

  it('returns false when params is empty', () => {
    const message = makeNotification([]);
    expect(isCapTPNotification(message)).toBe(false);
  });

  it('returns false when params has more than one element', () => {
    const message = makeNotification([{ type: 'foo' }, { type: 'bar' }]);
    expect(isCapTPNotification(message)).toBe(false);
  });

  it('returns true for JSON-RPC request with id if it matches captp format', () => {
    // A request with an id is still a valid captp message format-wise
    const request = {
      jsonrpc: '2.0' as const,
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
    const notification = makeNotification([captpMessage]);
    expect(getCapTPMessage(notification)).toStrictEqual(captpMessage);
  });

  it('throws for non-CapTP notification', () => {
    const message = {
      jsonrpc: '2.0',
      method: 'other',
      params: [],
    };
    // @ts-expect-error - we want to test the error case
    expect(() => getCapTPMessage(message)).toThrow('Not a CapTP notification');
  });

  it('throws when params is empty', () => {
    const message = makeNotification([]);
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
  let sendMock: (message: CapTPMessage) => void;

  beforeEach(() => {
    sendMock = vi.fn();
  });

  it('returns object with dispatch, getKernel, and abort', () => {
    const capTP = makeBackgroundCapTP({ send: sendMock });

    expect(capTP).toStrictEqual({
      dispatch: expect.any(Function),
      getKernel: expect.any(Function),
      abort: expect.any(Function),
    });
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

    expect(sendMock).toHaveBeenCalled();
    const sentMessage = vi.mocked(sendMock).mock.calls[0]?.[0] as CapTPMessage;
    expect(sentMessage).toBeDefined();
  });

  it('dispatch returns boolean', () => {
    const capTP = makeBackgroundCapTP({ send: sendMock });

    const result = capTP.dispatch({ type: 'unknown' });

    expect(result).toBe(false);
  });
});
