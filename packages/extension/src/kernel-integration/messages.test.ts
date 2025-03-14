import { describe, it, expect } from 'vitest';

import {
  isKernelControlCommand,
  isKernelControlReply,
  isKernelStatus,
} from './messages.ts';
import clusterConfig from '../vats/default-cluster.json';

describe('isKernelControlCommand', () => {
  it.each([
    [
      'launch vat command',
      {
        method: 'launchVat',
        params: { sourceSpec: 'test.js' },
      },
      true,
    ],
    [
      'restart vat command',
      {
        method: 'restartVat',
        params: { id: 'v0' },
      },
      true,
    ],
    [
      'terminate vat command',
      {
        method: 'terminateVat',
        params: { id: 'v0' },
      },
      true,
    ],
    [
      'terminate all vats command',
      {
        method: 'terminateAllVats',
        params: [],
      },
      true,
    ],
    [
      'get status command',
      {
        method: 'getStatus',
        params: [],
      },
      true,
    ],
    [
      'send message command',
      {
        method: 'sendVatCommand',
        params: {
          id: 'v0',
          payload: { test: 'data' },
        },
      },
      true,
    ],
    [
      'clear state command',
      {
        method: 'clearState',
        params: [],
      },
      true,
    ],
    [
      'execute DB query command',
      {
        method: 'executeDBQuery',
        params: {
          sql: 'SELECT * FROM test',
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
        method: 'launchVat',
        result: null,
      },
      true,
    ],
    [
      'launch vat error reply',
      {
        method: 'launchVat',
        result: { error: 'Failed to launch vat' },
      },
      true,
    ],
    [
      'get status reply',
      {
        method: 'getStatus',
        result: {
          clusterConfig,
          vats: [
            {
              id: 'v0',
              config: { sourceSpec: 'test.js' },
            },
          ],
        },
      },
      true,
    ],
    [
      'send message reply',
      {
        method: 'sendVatCommand',
        result: { result: 'success' },
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
        method: 'invalidMethod',
        result: null,
      },
      false,
    ],
    [
      'invalid result',
      {
        method: 'launchVat',
        result: 'invalid',
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
