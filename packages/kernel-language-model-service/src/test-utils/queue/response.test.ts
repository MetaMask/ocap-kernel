import { describe, it, expect } from 'vitest';

import { objectResponseFormatter } from './response.ts';

describe('objectResponseFormatter', () => {
  it.each([
    {
      response: 'hello',
      done: false,
      expected: { response: 'hello', done: false },
    },
    {
      response: 'world',
      done: true,
      expected: { response: 'world', done: true },
    },
    { response: '', done: false, expected: { response: '', done: false } },
  ])(
    'formats response "$response" with done=$done',
    ({ response, done, expected }) => {
      expect(objectResponseFormatter(response, done)).toStrictEqual(expected);
    },
  );
});
