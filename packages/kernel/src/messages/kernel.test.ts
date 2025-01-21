import { describe, expect, it } from 'vitest';

import { isKernelCommand, isKernelCommandReply } from './kernel.js';

describe('isKernelCommand', () => {
  it.each`
    value                                    | expectedResult | description
    ${123}                                   | ${false}       | ${'invalid command: primitive number'}
    ${{ method: true, params: 'data' }}      | ${false}       | ${'invalid command: invalid type'}
    ${{ method: 123, params: null }}         | ${false}       | ${'invalid command: invalid type and valid data'}
    ${{ method: 'some-type', params: true }} | ${false}       | ${'invalid command: valid type and invalid data'}
  `('returns $expectedResult for $description', ({ value, expectedResult }) => {
    expect(isKernelCommand(value)).toBe(expectedResult);
  });
});

describe('isKernelCommandReply', () => {
  it.each`
    value                                    | expectedResult | description
    ${123}                                   | ${false}       | ${'invalid command reply: primitive number'}
    ${{ method: true, params: 'data' }}      | ${false}       | ${'invalid command reply: invalid type'}
    ${{ method: 123, params: null }}         | ${false}       | ${'invalid command reply: invalid type and valid data'}
    ${{ method: 'some-type', params: true }} | ${false}       | ${'invalid command reply: valid type and invalid data'}
  `('returns $expectedResult for $description', ({ value, expectedResult }) => {
    expect(isKernelCommandReply(value)).toBe(expectedResult);
  });
});
