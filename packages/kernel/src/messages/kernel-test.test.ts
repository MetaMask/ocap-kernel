import { describe, expect, it } from 'vitest';

import {
  isKernelTestCommand,
  isKernelTestCommandReply,
  KernelTestCommandMethod,
} from './kernel-test.js';

describe('isKernelTestCommand', () => {
  it.each`
    value                                                                              | expectedResult | description
    ${{ method: KernelTestCommandMethod.KVGet, params: 'data' }}                       | ${true}        | ${'valid command with string data'}
    ${{ method: KernelTestCommandMethod.KVSet, params: { key: 'foo', value: 'bar' } }} | ${true}        | ${'valid command with object data'}
    ${123}                                                                             | ${false}       | ${'invalid command: primitive number'}
    ${{ method: true, params: 'data' }}                                                | ${false}       | ${'invalid command: invalid type'}
    ${{ method: KernelTestCommandMethod.KVSet }}                                       | ${false}       | ${'invalid command: missing data'}
    ${{ method: KernelTestCommandMethod.KVSet, params: 123 }}                          | ${false}       | ${'invalid command: data is a primitive number'}
    ${{ method: 123, params: null }}                                                   | ${false}       | ${'invalid command: invalid type and valid data'}
    ${{ method: 'some-type', params: true }}                                           | ${false}       | ${'invalid command: valid type and invalid data'}
  `('returns $expectedResult for $description', ({ value, expectedResult }) => {
    expect(isKernelTestCommand(value)).toBe(expectedResult);
  });
});

describe('isKernelTestCommandReply', () => {
  it.each`
    value                                                       | expectedResult | description
    ${{ method: KernelTestCommandMethod.KVGet, params: 'foo' }} | ${true}        | ${'valid command reply with string data'}
    ${{ method: KernelTestCommandMethod.KVGet, params: null }}  | ${false}       | ${'invalid command reply: with null data'}
    ${123}                                                      | ${false}       | ${'invalid command reply: primitive number'}
    ${{ method: true, params: 'data' }}                         | ${false}       | ${'invalid command reply: invalid type'}
    ${{ method: KernelTestCommandMethod.KVSet }}                | ${false}       | ${'invalid command reply: missing data'}
    ${{ method: KernelTestCommandMethod.KVSet, params: 123 }}   | ${false}       | ${'invalid command reply: data is a primitive number'}
    ${{ method: 123, params: null }}                            | ${false}       | ${'invalid command reply: invalid type and valid data'}
    ${{ method: 'some-type', params: true }}                    | ${false}       | ${'invalid command reply: valid type and invalid data'}
  `('returns $expectedResult for $description', ({ value, expectedResult }) => {
    expect(isKernelTestCommandReply(value)).toBe(expectedResult);
  });
});
