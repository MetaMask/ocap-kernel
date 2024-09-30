import { describe, expect, it } from 'vitest';

import { isCapTpMessage, isCapTpPayload } from './captp.js';

describe('isCapTpMessage', () => {
  it.each`
    value                             | expectedResult | description
    ${{ type: 'CTP_CALL', epoch: 0 }} | ${true}        | ${'valid type with numerical epoch'}
    ${{ type: 'CTP_CALL' }}           | ${false}       | ${'missing epoch'}
  `('returns $expectedResult for $description', ({ value, expectedResult }) => {
    expect(isCapTpMessage(value)).toBe(expectedResult);
  });
});

describe('isCapTpPayload', () => {
  it.each`
    value                                           | expectedResult | description
    ${{ method: 'foo', params: [0, 'bar', false] }} | ${true}        | ${'valid command with string data'}
    ${{ method: 'foo' }}                            | ${false}       | ${'no params'}
    ${{ method: 'foo', params: 'bar' }}             | ${false}       | ${'nonarray params'}
  `('returns $expectedResult for $description', ({ value, expectedResult }) => {
    expect(isCapTpPayload(value)).toBe(expectedResult);
  });
});
