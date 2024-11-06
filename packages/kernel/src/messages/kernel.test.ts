import { describe, expect, it } from 'vitest';

import {
  isKernelCommand,
  isKernelCommandReply,
  KernelCommandMethod,
} from './kernel.js';

describe('isKernelCommand', () => {
  it.each`
    value                                                                          | expectedResult | description
    ${{ method: KernelCommandMethod.kvGet, params: 'data' }}                       | ${true}        | ${'valid command with string data'}
    ${{ method: KernelCommandMethod.kvSet, params: { key: 'foo', value: 'bar' } }} | ${true}        | ${'valid command with object data'}
    ${123}                                                                         | ${false}       | ${'invalid command: primitive number'}
    ${{ method: true, params: 'data' }}                                            | ${false}       | ${'invalid command: invalid type'}
    ${{ method: KernelCommandMethod.kvSet }}                                       | ${false}       | ${'invalid command: missing data'}
    ${{ method: KernelCommandMethod.kvSet, params: 123 }}                          | ${false}       | ${'invalid command: data is a primitive number'}
    ${{ method: 123, params: null }}                                               | ${false}       | ${'invalid command: invalid type and valid data'}
    ${{ method: 'some-type', params: true }}                                       | ${false}       | ${'invalid command: valid type and invalid data'}
  `('returns $expectedResult for $description', ({ value, expectedResult }) => {
    expect(isKernelCommand(value)).toBe(expectedResult);
  });
});

describe('isKernelCommandReply', () => {
  it.each`
    value                                                   | expectedResult | description
    ${{ method: KernelCommandMethod.kvGet, params: 'foo' }} | ${true}        | ${'valid command reply with string data'}
    ${{ method: KernelCommandMethod.kvGet, params: null }}  | ${false}       | ${'invalid command reply: with null data'}
    ${123}                                                  | ${false}       | ${'invalid command reply: primitive number'}
    ${{ method: true, params: 'data' }}                     | ${false}       | ${'invalid command reply: invalid type'}
    ${{ method: KernelCommandMethod.kvSet }}                | ${false}       | ${'invalid command reply: missing data'}
    ${{ method: KernelCommandMethod.kvSet, params: 123 }}   | ${false}       | ${'invalid command reply: data is a primitive number'}
    ${{ method: 123, params: null }}                        | ${false}       | ${'invalid command reply: invalid type and valid data'}
    ${{ method: 'some-type', params: true }}                | ${false}       | ${'invalid command reply: valid type and invalid data'}
  `('returns $expectedResult for $description', ({ value, expectedResult }) => {
    expect(isKernelCommandReply(value)).toBe(expectedResult);
  });
});
