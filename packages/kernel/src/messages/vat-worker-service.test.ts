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

const launch: VatWorkerServiceCommandReply['payload'] = {
  method: VatWorkerServiceCommandMethod.Launch,
  params: { vatId: 'v0' },
};
const terminate: VatWorkerServiceCommandReply['payload'] = {
  method: VatWorkerServiceCommandMethod.Terminate,
  params: { vatId: 'v0' },
};
const terminateAll: VatWorkerServiceCommandReply['payload'] = {
  method: VatWorkerServiceCommandMethod.TerminateAll,
  params: null,
};

const sharedCases = (payload: unknown): [boolean, string, unknown][] => [
  [true, 'valid message id with valid payload', { id: 'm0', payload }],
  [false, 'invalid id', { id: 'vat-message-id', payload }],
  [false, 'numerical id', { id: 1, payload }],
  [false, 'missing payload', { id: 'm0' }],
];

describe('isVatWorkerServiceCommand', () => {
  describe.each`
    payload
    ${launch}
    ${terminate}
    ${terminateAll}
  `('$payload.method', ({ payload }) => {
    it.each(sharedCases(payload))(
      'returns %j for %j',
      (expectedResult, _, value) => {
        expect(isVatWorkerServiceCommand(value)).toBe(expectedResult);
      },
    );
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
      method: launch.method,
      params: {
        ...launch.params,
        error: marshalError(new VatAlreadyExistsError(vatId)),
      },
    });
    it.each([
      ...sharedCases(launch),
      [
        true,
        'valid message id with valid error',
        { id: 'm0', payload: withMarshaledError('v0') },
      ],
      [
        false,
        'valid message id with invalid error',
        { id: 'm0', payload: withError(launch, 404) },
      ],
    ])('returns %j for %j', (expectedResult, _, value) => {
      expect(isVatWorkerServiceCommandReply(value)).toBe(expectedResult);
    });
  });

  describe('terminate', () => {
    const withMarshaledError = (vatId: VatId): unknown => ({
      method: terminate.method,
      params: {
        ...terminate.params,
        error: marshalError(new VatDeletedError(vatId)),
      },
    });
    it.each([
      ...sharedCases(terminate),
      [
        true,
        'valid message id with valid error',
        { id: 'm0', payload: withMarshaledError('v0') },
      ],
      [
        false,
        'valid message id with invalid error',
        { id: 'm0', payload: withError(terminate, 404) },
      ],
    ])('returns %j for %j', (expectedResult, _, value) => {
      expect(isVatWorkerServiceCommandReply(value)).toBe(expectedResult);
    });
  });

  describe('terminateAll', () => {
    const withValidVatError = (vatId: VatId): unknown => ({
      method: terminateAll.method,
      params: { vatId, error: marshalError(new VatDeletedError(vatId)) },
    });
    const withMarshaledError = (): unknown => ({
      method: terminateAll.method,
      params: { error: marshalError(new Error('code: foobar')) },
    });
    it.each([
      ...sharedCases(terminateAll),
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
        { id: 'm0', payload: withError(terminateAll, 404) },
      ],
    ])('returns %j for %j', (expectedResult, _, value) => {
      expect(isVatWorkerServiceCommandReply(value)).toBe(expectedResult);
    });
  });
});
