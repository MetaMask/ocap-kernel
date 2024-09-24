import { describe, it, expect } from 'vitest';

import {
  isVatMessage,
  isCapTpMessage,
  isCommand,
  isCapTpPayload,
} from './type-guards.js';
import { CommandMethod } from './types.js';

describe('type-guards', () => {
  describe('isCapTpPayload', () => {
    it.each`
      value                                           | expectedResult | description
      ${{ method: 'someMethod', params: [] }}         | ${true}        | ${'valid cap tp payload with empty params'}
      ${{ method: 'someMethod', params: ['param1'] }} | ${true}        | ${'valid cap tp payload with non-empty params'}
      ${123}                                          | ${false}       | ${'invalid cap tp payload: primitive number'}
      ${{ method: true, params: [] }}                 | ${false}       | ${'invalid cap tp payload: invalid method type'}
      ${{ method: 'someMethod' }}                     | ${false}       | ${'invalid cap tp payload: missing params'}
      ${{ method: 'someMethod', params: 'param1' }}   | ${false}       | ${'invalid cap tp payload: params is a primitive string'}
      ${{ method: 123, params: [] }}                  | ${false}       | ${'invalid cap tp payload: invalid method type and valid params'}
      ${{ method: 'someMethod', params: true }}       | ${false}       | ${'invalid cap tp payload: valid method and invalid params'}
    `(
      'returns $expectedResult for $description',
      ({ value, expectedResult }) => {
        expect(isCapTpPayload(value)).toBe(expectedResult);
      },
    );
  });

  describe('isCommand', () => {
    it.each`
      value                                         | expectedResult | description
      ${{ type: CommandMethod.Ping, data: null }}   | ${true}        | ${'valid command with null data'}
      ${{ type: CommandMethod.Ping, data: 'data' }} | ${true}        | ${'valid command with string data'}
      ${123}                                        | ${false}       | ${'invalid command: primitive number'}
      ${{ type: true, data: 'data' }}               | ${false}       | ${'invalid command: invalid type'}
      ${{ type: CommandMethod.Ping }}               | ${false}       | ${'invalid command: missing data'}
      ${{ type: CommandMethod.Ping, data: 123 }}    | ${false}       | ${'invalid command: data is a primitive number'}
      ${{ type: 123, data: null }}                  | ${false}       | ${'invalid command: invalid type and valid data'}
      ${{ type: 'some-type', data: true }}          | ${false}       | ${'invalid command: valid type and invalid data'}
    `(
      'returns $expectedResult for $description',
      ({ value, expectedResult }) => {
        expect(isCommand(value)).toBe(expectedResult);
      },
    );
  });

  describe('isVatMessage', () => {
    it.each`
      value                                                                   | expectedResult | description
      ${{ id: 'some-id', payload: { type: CommandMethod.Ping, data: null } }} | ${true}        | ${'valid vat message'}
      ${123}                                                                  | ${false}       | ${'invalid vat message: primitive number'}
      ${{ id: true, payload: {} }}                                            | ${false}       | ${'invalid vat message: invalid id and empty payload'}
      ${{ id: 'some-id', payload: null }}                                     | ${false}       | ${'invalid vat message: payload is null'}
      ${{ id: 123, payload: { type: CommandMethod.Ping, data: null } }}       | ${false}       | ${'invalid vat message: invalid id type'}
      ${{ id: 'some-id' }}                                                    | ${false}       | ${'invalid vat message: missing payload'}
      ${{ id: 'some-id', payload: 123 }}                                      | ${false}       | ${'invalid vat message: payload is a primitive number'}
      ${{ id: 'some-id', payload: { type: 123, data: null } }}                | ${false}       | ${'invalid vat message: invalid type in payload'}
    `(
      'returns $expectedResult for $description',
      ({ value, expectedResult }) => {
        expect(isVatMessage(value)).toBe(expectedResult);
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
