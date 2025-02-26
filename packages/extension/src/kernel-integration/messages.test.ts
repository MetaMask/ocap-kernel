import { describe, it, expect } from 'vitest';

import {
  isKernelControlCommand,
  isKernelControlReply,
  isKernelStatus,
} from './messages.js';
import clusterConfig from '../vats/default-cluster.json';

describe('isKernelControlCommand', () => {
  it.each([
    [
      'launch vat command',
      {
        id: 'test-1',
        payload: {
          method: 'launchVat',
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
          method: 'restartVat',
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
          method: 'terminateVat',
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
          method: 'terminateAllVats',
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
          method: 'getStatus',
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
          method: 'sendVatCommand',
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
          method: 'clearState',
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
          method: 'executeDBQuery',
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
          method: 'launchVat',
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
          method: 'launchVat',
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
          method: 'launchVat',
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
          method: 'getStatus',
          params: {
            clusterConfig,
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
          method: 'sendVatCommand',
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
          method: 'launchVat',
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
        clusterConfig,
        vats: [
          {
            id: 'v0',
            config: { sourceSpec: 'test.js' },
          },
        ],
      },
      true,
    ],
    ['empty vats array', { vats: [], clusterConfig }, true],
    ['null value', null, false],
    ['undefined value', undefined, false],
    ['empty object', {}, false],
    ['null vats', { vats: null, clusterConfig }, false],
    ['invalid vats type', { vats: 'invalid', clusterConfig }, false],
    ['invalid vat object', { vats: [{ invalid: true }], clusterConfig }, false],
    [
      'invalid vat id type',
      { vats: [{ id: 123, config: {} }], clusterConfig },
      false,
    ],
    ['invalid cluster config', { vats: [], clusterConfig: 'invalid' }, false],
    ['invalid cluster config type', { vats: [], clusterConfig: 123 }, false],
    ['invalid cluster config object', { vats: [], clusterConfig: {} }, false],
    ['invalid cluster config array', { vats: [], clusterConfig: [] }, false],
    [
      'invalid cluster config boolean',
      { vats: [], clusterConfig: true },
      false,
    ],
    ['invalid cluster config number', { vats: [], clusterConfig: 123 }, false],
    [
      'invalid cluster config string',
      { vats: [], clusterConfig: 'test' },
      false,
    ],
  ])('should validate %s', (_, status, expected) => {
    expect(isKernelStatus(status)).toBe(expected);
  });
});
