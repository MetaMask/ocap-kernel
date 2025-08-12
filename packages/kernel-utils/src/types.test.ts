import { isObject } from '@metamask/utils';
import { describe, it, expect } from 'vitest';

import {
  isJsonRpcCall,
  isJsonRpcMessage,
  isPrimitive,
  isTypedArray,
  isTypedObject,
} from './types.ts';

const isNumber = (value: unknown): value is number => typeof value === 'number';
const alwaysFalse = () => false;
const alwaysTrue = () => true;

describe('isPrimitive', () => {
  it.each`
    label             | value
    ${'empty string'} | ${''}
    ${'string'}       | ${'foo'}
    ${'zero'}         | ${0}
    ${'float'}        | ${6.28}
    ${'bigint'}       | ${BigInt('9999999999999999')}
    ${'symbol'}       | ${Symbol('meaning')}
    ${'false'}        | ${false}
    ${'null'}         | ${null}
    ${'undefined'}    | ${undefined}
  `('returns true for primitive $label', ({ value }) => {
    expect(isPrimitive(value)).toBe(true);
  });

  it.each`
    label               | value
    ${'empty array'}    | ${[]}
    ${'empty object'}   | ${{}}
    ${'object'}         | ${{ foo: 'bar' }}
    ${'MessageChannel'} | ${new MessageChannel()}
    ${'function ref'}   | ${alwaysTrue}
    ${'inline function'} | ${function foo() {
  return 'bar';
}}
  `('returns false for non-primitive $label', ({ value }) => {
    expect(isPrimitive(value)).toBe(false);
  });
});

describe('isTypedArray', () => {
  it.each`
    label                | value                   | guard
    ${'empty array'}     | ${[]}                   | ${alwaysFalse}
    ${'number array'}    | ${[0, 2, 4.5]}          | ${isNumber}
    ${'primitive array'} | ${[0, 'foo']}           | ${isPrimitive}
    ${'object array'}    | ${[{}, { foo: 'bar' }]} | ${isObject}
    ${'array of arrays'} | ${[[]]}                 | ${Array.isArray}
  `('returns true for homogeneously typed array $label', ({ value, guard }) => {
    expect(isTypedArray(value, guard)).toBe(true);
  });

  it.each`
    label              | value         | guard
    ${'null in array'} | ${[null]}     | ${alwaysFalse}
    ${'number'}        | ${0}          | ${isNumber}
    ${'null'}          | ${null}       | ${alwaysTrue}
    ${'mixed array'}   | ${[0, 'foo']} | ${isNumber}
    ${'nested array'}  | ${[0, [1]]}   | ${isNumber}
    ${'mixed objects'} | ${[{}, 1]}    | ${isObject}
  `('returns false for invalid $label', ({ value, guard }) => {
    expect(isTypedArray(value, guard)).toBe(false);
  });
});

describe('isTypedObject', () => {
  it.each`
    label              | value                           | guard
    ${'empty object'}  | ${{}}                           | ${alwaysFalse}
    ${'number object'} | ${{ foo: 0, bar: 2 }}           | ${isNumber}
    ${'object object'} | ${{ foo: {}, bar: { foo: 0 } }} | ${isObject}
  `(
    'returns true for homogeneously typed object $label',
    ({ value, guard }) => {
      expect(isTypedObject(value, guard)).toBe(true);
    },
  );

  it.each`
    label              | value                    | guard
    ${'string object'} | ${{ foo: 'bar' }}        | ${alwaysFalse}
    ${'null'}          | ${null}                  | ${alwaysTrue}
    ${'array'}         | ${[{}, { foo: 'bar ' }]} | ${isObject}
  `('returns false for invalid $label', ({ value, guard }) => {
    expect(isTypedObject(value, guard)).toBe(false);
  });
});

describe('isJsonRpcCall', () => {
  it.each`
    label                   | value
    ${'with id and array'}  | ${{ jsonrpc: '2.0', id: '1', method: 'foo', params: [] }}
    ${'with id and object'} | ${{ jsonrpc: '2.0', id: '1', method: 'foo', params: {} }}
    ${'without id array'}   | ${{ jsonrpc: '2.0', method: 'foo', params: [] }}
    ${'without id object'}  | ${{ jsonrpc: '2.0', method: 'foo', params: {} }}
  `('returns true for valid JSON-RPC call $label', ({ value }) => {
    expect(isJsonRpcCall(value)).toBe(true);
  });

  it.each`
    label                 | value
    ${'null'}             | ${null}
    ${'undefined'}        | ${undefined}
    ${'string'}           | ${'foo'}
    ${'array'}            | ${[]}
    ${'empty object'}     | ${{}}
    ${'response object'}  | ${{ jsonrpc: '2.0', id: '1', result: { foo: 'bar' } }}
    ${'error object'}     | ${{ jsonrpc: '2.0', id: '1', error: { code: 1, message: 'foo' } }}
    ${'missing jsonrpc'}  | ${{ id: '1', method: 'foo', params: [1, 2, 3] }}
    ${'missing method'}   | ${{ jsonrpc: '2.0', id: '1', params: { foo: 'bar' } }}
    ${'wrong property'}   | ${{ jsonrpc: '2.0', result: 'foo', params: [1, 2, 3] }}
    ${'wrong property 2'} | ${{ jsonrpc: '2.0', error: 'foo', params: { foo: 'bar' } }}
  `('returns false for invalid $label', ({ value }) => {
    expect(isJsonRpcCall(value)).toBe(false);
  });
});

describe('isJsonRpcMessage', () => {
  it.each`
    label                       | value
    ${'call with id array'}     | ${{ jsonrpc: '2.0', id: '1', method: 'foo', params: [] }}
    ${'call with id object'}    | ${{ jsonrpc: '2.0', id: '1', method: 'foo', params: {} }}
    ${'call without id array'}  | ${{ jsonrpc: '2.0', method: 'foo', params: [] }}
    ${'call without id object'} | ${{ jsonrpc: '2.0', method: 'foo', params: {} }}
    ${'response'}               | ${{ jsonrpc: '2.0', id: '1', result: { foo: 'bar' } }}
    ${'error'}                  | ${{ jsonrpc: '2.0', id: '1', error: { code: 1, message: 'foo' } }}
  `('returns true for valid JSON-RPC message $label', ({ value }) => {
    expect(isJsonRpcMessage(value)).toBe(true);
  });

  it.each`
    label                 | value
    ${'null'}             | ${null}
    ${'undefined'}        | ${undefined}
    ${'string'}           | ${'foo'}
    ${'array'}            | ${[]}
    ${'empty object'}     | ${{}}
    ${'missing jsonrpc'}  | ${{ id: '1', method: 'foo', params: [1, 2, 3] }}
    ${'missing method'}   | ${{ jsonrpc: '2.0', id: '1', params: { foo: 'bar' } }}
    ${'wrong property'}   | ${{ jsonrpc: '2.0', result: 'foo', params: [1, 2, 3] }}
    ${'wrong property 2'} | ${{ jsonrpc: '2.0', error: 'foo', params: { foo: 'bar' } }}
  `('returns false for invalid $label', ({ value }) => {
    expect(isJsonRpcMessage(value)).toBe(false);
  });
});
