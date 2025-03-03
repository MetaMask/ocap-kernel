import { describe, expect, it } from 'vitest';

import type {
  VatWorkerServiceCommand,
  VatWorkerServiceReply,
} from './vat-worker-service.ts';
import {
  isVatWorkerServiceCommand,
  isVatWorkerServiceReply,
  VatWorkerServiceCommandMethod,
} from './vat-worker-service.ts';

const launchPayload: VatWorkerServiceCommand['payload'] = harden({
  method: VatWorkerServiceCommandMethod.launch,
  params: { vatId: 'v0', vatConfig: { sourceSpec: 'bogus.js' } },
});
const launchReplyPayload: VatWorkerServiceReply['payload'] = harden({
  method: VatWorkerServiceCommandMethod.launch,
  params: { vatId: 'v0' },
});

const terminatePayload: VatWorkerServiceCommand['payload'] = harden({
  method: VatWorkerServiceCommandMethod.terminate,
  params: { vatId: 'v0' },
});
const terminateReplyPayload: VatWorkerServiceReply['payload'] = harden({
  method: VatWorkerServiceCommandMethod.terminate,
  params: { vatId: 'v0' },
});

const terminateAllPayload: VatWorkerServiceCommand['payload'] = harden({
  method: VatWorkerServiceCommandMethod.terminateAll,
  params: null,
});
const terminateAllReplyPayload: VatWorkerServiceReply['payload'] = harden({
  method: VatWorkerServiceCommandMethod.terminateAll,
  params: null,
});

describe('isVatWorkerServiceCommand', () => {
  describe.each`
    payload
    ${launchPayload}
    ${terminatePayload}
    ${terminateAllPayload}
  `('$payload.method', ({ payload }) => {
    it.each([
      [true, 'valid message id with valid payload', { id: 'm0', payload }],
      [false, 'invalid id', { id: 'vat-message-id', payload }],
      [false, 'numerical id', { id: 1, payload }],
      [false, 'missing payload', { id: 'm0' }],
    ])('returns %j for %j', (expectedResult, _, value) => {
      expect(isVatWorkerServiceCommand(value)).toBe(expectedResult);
    });
  });
});

describe('isVatWorkerServiceReply', () => {
  const withError = (
    payload: VatWorkerServiceReply['payload'],
    problem: unknown,
  ): unknown => ({
    method: payload.method,
    params: { ...payload.params, error: problem },
  });

  describe('launch', () => {
    it.each([
      [
        true,
        'valid message id with valid payload',
        { id: 'm0', payload: launchReplyPayload },
      ],
      [
        false,
        'invalid id',
        { id: 'vat-message-id', payload: launchReplyPayload },
      ],
      [false, 'numerical id', { id: 1, payload: launchReplyPayload }],
      [false, 'missing payload', { id: 'm0' }],
      [
        true,
        'valid message id with error',
        { id: 'm0', payload: withError(launchReplyPayload, new Error('foo')) },
      ],
      [
        false,
        'valid message id with invalid error',
        { id: 'm0', payload: withError(launchReplyPayload, 404) },
      ],
    ])('returns %j for %j', (expectedResult, _, value) => {
      expect(isVatWorkerServiceReply(value)).toBe(expectedResult);
    });
  });

  describe('terminate', () => {
    it.each([
      [
        true,
        'valid message id with valid payload',
        { id: 'm0', payload: terminateReplyPayload },
      ],
      [
        false,
        'invalid id',
        { id: 'vat-message-id', payload: terminateReplyPayload },
      ],
      [false, 'numerical id', { id: 1, payload: terminateReplyPayload }],
      [false, 'missing payload', { id: 'm0' }],
      [
        true,
        'valid message id with error',
        {
          id: 'm0',
          payload: withError(terminateReplyPayload, new Error('foo')),
        },
      ],
      [
        false,
        'valid message id with invalid error',
        { id: 'm0', payload: withError(terminateReplyPayload, 404) },
      ],
    ])('returns %j for %j', (expectedResult, _, value) => {
      expect(isVatWorkerServiceReply(value)).toBe(expectedResult);
    });
  });

  describe('terminateAll', () => {
    it.each([
      [
        true,
        'valid message id with valid payload',
        { id: 'm0', payload: terminateAllReplyPayload },
      ],
      [
        false,
        'invalid id',
        { id: 'vat-message-id', payload: terminateAllReplyPayload },
      ],
      [false, 'numerical id', { id: 1, payload: terminateAllReplyPayload }],
      [false, 'missing payload', { id: 'm0' }],
      [
        true,
        'valid message id with error',
        {
          id: 'm0',
          payload: withError(terminateAllReplyPayload, new Error('foo')),
        },
      ],
      [
        false,
        'valid message id with invalid error',
        { id: 'm0', payload: withError(terminateAllReplyPayload, 404) },
      ],
    ])('returns %j for %j', (expectedResult, _, value) => {
      expect(isVatWorkerServiceReply(value)).toBe(expectedResult);
    });
  });
});
