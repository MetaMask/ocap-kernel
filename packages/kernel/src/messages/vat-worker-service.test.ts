import '@ocap/shims/endoify';
import {
  marshalError,
  VatAlreadyExistsError,
  VatDeletedError,
} from '@ocap/errors';
import { describe, expect, it } from 'vitest';

import type { VatWorkerServiceCommandReply } from './vat-worker-service.js';
import {
  isVatWorkerServiceCommand,
  isVatWorkerServiceCommandReply,
  VatWorkerServiceCommandMethod,
} from './vat-worker-service.js';
import type { VatId } from '../types.js';

const launchPayload: VatWorkerServiceCommandReply['payload'] = harden({
  method: VatWorkerServiceCommandMethod.launch,
  params: { vatId: 'v0' },
});
const terminatePayload: VatWorkerServiceCommandReply['payload'] = harden({
  method: VatWorkerServiceCommandMethod.terminate,
  params: { vatId: 'v0' },
});
const terminateAllPayload: VatWorkerServiceCommandReply['payload'] = harden({
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

describe('isVatWorkerServiceCommandReply', () => {
  const withError = (
    payload: VatWorkerServiceCommandReply['payload'],
    problem: unknown,
  ): unknown => ({
    method: payload.method,
    params: { ...payload.params, error: problem },
  });

  describe('launch', () => {
    const withMarshaledError = (vatId: VatId): unknown => ({
      method: launchPayload.method,
      params: {
        ...launchPayload.params,
        error: marshalError(new VatAlreadyExistsError(vatId)),
      },
    });
    it.each([
      [
        true,
        'valid message id with valid payload',
        { id: 'm0', payload: launchPayload },
      ],
      [false, 'invalid id', { id: 'vat-message-id', payload: launchPayload }],
      [false, 'numerical id', { id: 1, payload: launchPayload }],
      [false, 'missing payload', { id: 'm0' }],
      [
        true,
        'valid message id with valid error',
        { id: 'm0', payload: withMarshaledError('v0') },
      ],
      [
        false,
        'valid message id with invalid error',
        { id: 'm0', payload: withError(launchPayload, 404) },
      ],
    ])('returns %j for %j', (expectedResult, _, value) => {
      expect(isVatWorkerServiceCommandReply(value)).toBe(expectedResult);
    });
  });

  describe('terminate', () => {
    const withMarshaledError = (vatId: VatId): unknown => ({
      method: terminatePayload.method,
      params: {
        ...terminatePayload.params,
        error: marshalError(new VatDeletedError(vatId)),
      },
    });
    it.each([
      [
        true,
        'valid message id with valid payload',
        { id: 'm0', payload: terminatePayload },
      ],
      [
        false,
        'invalid id',
        { id: 'vat-message-id', payload: terminatePayload },
      ],
      [false, 'numerical id', { id: 1, payload: terminatePayload }],
      [false, 'missing payload', { id: 'm0' }],
      [
        true,
        'valid message id with valid error',
        { id: 'm0', payload: withMarshaledError('v0') },
      ],
      [
        false,
        'valid message id with invalid error',
        { id: 'm0', payload: withError(terminatePayload, 404) },
      ],
    ])('returns %j for %j', (expectedResult, _, value) => {
      expect(isVatWorkerServiceCommandReply(value)).toBe(expectedResult);
    });
  });

  describe('terminateAll', () => {
    const withValidVatError = (vatId: VatId): unknown => ({
      method: terminateAllPayload.method,
      params: { vatId, error: marshalError(new VatDeletedError(vatId)) },
    });
    const withMarshaledError = (): unknown => ({
      method: terminateAllPayload.method,
      params: { error: marshalError(new Error('code: foobar')) },
    });
    it.each([
      [
        true,
        'valid message id with valid payload',
        { id: 'm0', payload: terminateAllPayload },
      ],
      [
        false,
        'invalid id',
        { id: 'vat-message-id', payload: terminateAllPayload },
      ],
      [false, 'numerical id', { id: 1, payload: terminateAllPayload }],
      [false, 'missing payload', { id: 'm0' }],
      [
        true,
        'valid message id with valid vat error',
        { id: 'm0', payload: withValidVatError('v0') },
      ],
      [
        true,
        'valid message id with valid error',
        { id: 'm0', payload: withMarshaledError() },
      ],
      [
        false,
        'valid message id with invalid error',
        { id: 'm0', payload: withError(terminateAllPayload, 404) },
      ],
    ])('returns %j for %j', (expectedResult, _, value) => {
      expect(isVatWorkerServiceCommandReply(value)).toBe(expectedResult);
    });
  });
});
