import '@ocap/shims/endoify';
import { describe, it, expect } from 'vitest';

import {
  KernelControlMethod,
  isKernelControlCommand,
  isKernelControlReply,
  isKernelStatus,
} from './messages';

describe('KernelControlMethod', () => {
  it('should have all expected methods', () => {
    expect(Object.values(KernelControlMethod)).toStrictEqual([
      'launchVat',
      'restartVat',
      'terminateVat',
      'terminateAllVats',
      'getStatus',
      'reload',
      'sendMessage',
      'clearState',
      'executeDBQuery',
    ]);
  });
});

describe('isKernelControlCommand', () => {
  it.each([
    [
      'launch vat command',
      {
        id: 'test-1',
        payload: {
          method: KernelControlMethod.launchVat,
          params: { sourceSpec: 'test.js' },
        },
      },
      true,
    ],
    [
      'restart vat command',
      {
        id: 'test-1',
        payload: {
          method: KernelControlMethod.restartVat,
          params: { id: 'v0' },
        },
      },
      true,
    ],
    [
      'terminate vat command',
      {
        id: 'test-1',
        payload: {
          method: KernelControlMethod.terminateVat,
          params: { id: 'v0' },
        },
      },
      true,
    ],
    [
      'terminate all vats command',
      {
        id: 'test-1',
        payload: {
          method: KernelControlMethod.terminateAllVats,
          params: null,
        },
      },
      true,
    ],
    [
      'get status command',
      {
        id: 'test-1',
        payload: {
          method: KernelControlMethod.getStatus,
          params: null,
        },
      },
      true,
    ],
    [
      'send message command',
      {
        id: 'test-1',
        payload: {
          method: KernelControlMethod.sendMessage,
          params: {
            id: 'v0',
            payload: { test: 'data' },
          },
        },
      },
      true,
    ],
    [
      'clear state command',
      {
        id: 'test-1',
        payload: {
          method: KernelControlMethod.clearState,
          params: null,
        },
      },
      true,
    ],
    [
      'execute DB query command',
      {
        id: 'test-1',
        payload: {
          method: KernelControlMethod.executeDBQuery,
          params: {
            sql: 'SELECT * FROM test',
          },
        },
      },
      true,
    ],
    ['null value', null, false],
    ['undefined value', undefined, false],
    ['empty object', {}, false],
    ['missing payload', { id: 'test' }, false],
    ['missing id', { payload: {} }, false],
    [
      'invalid method',
      {
        id: 'test',
        payload: { method: 'invalidMethod' },
      },
      false,
    ],
    [
      'invalid params',
      {
        id: 'test',
        payload: {
          method: KernelControlMethod.launchVat,
          params: 'invalid',
        },
      },
      false,
    ],
  ])('should validate %s', (_, command, expected) => {
    expect(isKernelControlCommand(command)).toBe(expected);
  });
});

describe('isKernelControlReply', () => {
  it.each([
    [
      'launch vat success reply',
      {
        id: 'test-1',
        payload: {
          method: KernelControlMethod.launchVat,
          params: null,
        },
      },
      true,
    ],
    [
      'launch vat error reply',
      {
        id: 'test-1',
        payload: {
          method: KernelControlMethod.launchVat,
          params: { error: 'Failed to launch vat' },
        },
      },
      true,
    ],
    [
      'get status reply',
      {
        id: 'test-1',
        payload: {
          method: KernelControlMethod.getStatus,
          params: {
            vats: [
              {
                id: 'v0',
                config: { sourceSpec: 'test.js' },
              },
            ],
          },
        },
      },
      true,
    ],
    [
      'send message reply',
      {
        id: 'test-1',
        payload: {
          method: KernelControlMethod.sendMessage,
          params: { result: 'success' },
        },
      },
      true,
    ],
    ['null value', null, false],
    ['undefined value', undefined, false],
    ['empty object', {}, false],
    ['missing payload', { id: 'test' }, false],
    ['missing id', { payload: {} }, false],
    [
      'invalid method',
      {
        id: 'test',
        payload: { method: 'invalidMethod' },
      },
      false,
    ],
    [
      'invalid params',
      {
        id: 'test',
        payload: {
          method: KernelControlMethod.launchVat,
          params: 'invalid',
        },
      },
      false,
    ],
  ])('should validate %s', (_, reply, expected) => {
    expect(isKernelControlReply(reply)).toBe(expected);
  });
});

describe('isKernelStatus', () => {
  it.each([
    [
      'valid kernel status',
      {
        vats: [
          {
            id: 'v0',
            config: { sourceSpec: 'test.js' },
          },
        ],
      },
      true,
    ],
    ['empty vats array', { vats: [] }, true],
    ['null value', null, false],
    ['undefined value', undefined, false],
    ['empty object', {}, false],
    ['null vats', { vats: null }, false],
    ['invalid vats type', { vats: 'invalid' }, false],
    ['invalid vat object', { vats: [{ invalid: true }] }, false],
    ['invalid vat id type', { vats: [{ id: 123, config: {} }] }, false],
  ])('should validate %s', (_, status, expected) => {
    expect(isKernelStatus(status)).toBe(expected);
  });
});
