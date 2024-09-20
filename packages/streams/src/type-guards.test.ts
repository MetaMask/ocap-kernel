import { describe, it, expect } from 'vitest';

import { isWrappedVatMessage, isCapTpMessage } from './type-guards.js';
import { Command } from './types.js';

describe('type-guards', () => {
  describe('isWrappedVatMessage', () => {
    it.each`
      value                                                             | expectedResult | description
      ${{ id: 'some-id', message: { type: Command.Ping, data: null } }} | ${true}        | ${'valid wrapped vat message'}
      ${123}                                                            | ${false}       | ${'invalid wrapped vat message: primitive number'}
      ${{ id: true, message: {} }}                                      | ${false}       | ${'invalid wrapped vat message: invalid id and empty message'}
      ${{ id: 'some-id', message: null }}                               | ${false}       | ${'invalid wrapped vat message: message is null'}
      ${{ id: 123, message: { type: Command.Ping, data: null } }}       | ${false}       | ${'invalid wrapped vat message: invalid id type'}
      ${{ id: 'some-id' }}                                              | ${false}       | ${'invalid wrapped vat message: missing message'}
      ${{ id: 'some-id', message: 123 }}                                | ${false}       | ${'invalid wrapped vat message: message is a primitive number'}
      ${{ id: 'some-id', message: { type: 123, data: null } }}          | ${false}       | ${'invalid wrapped vat message: invalid type in message'}
    `(
      'returns $expectedResult for $description',
      ({ value, expectedResult }) => {
        expect(isWrappedVatMessage(value)).toBe(expectedResult);
      },
    );
  });

  describe('isCapTpMessage', () => {
    it.each`
      value                                     | expectedResult | description
      ${{ type: 'CTP_some-type', epoch: 123 }}  | ${true}        | ${'valid cap tp message'}
      ${{ type: true, epoch: null }}            | ${false}       | ${'invalid cap tp message: invalid type and epoch'}
      ${{ type: 'some-type' }}                  | ${false}       | ${'invalid cap tp message: missing epoch'}
      ${{ type: 123, epoch: null }}             | ${false}       | ${'invalid cap tp message: invalid type'}
      ${{ type: 'CTP_some-type' }}              | ${false}       | ${'invalid cap tp message: missing epoch'}
      ${{ type: 'CTP_some-type', epoch: true }} | ${false}       | ${'invalid cap tp message: invalid epoch type'}
    `(
      'returns $expectedResult for $description',
      ({ value, expectedResult }) => {
        expect(isCapTpMessage(value)).toBe(expectedResult);
      },
    );
  });
});
