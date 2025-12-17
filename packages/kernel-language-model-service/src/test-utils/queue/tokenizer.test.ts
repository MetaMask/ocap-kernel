import { describe, it, expect } from 'vitest';

import { whitespaceTokenizer } from './tokenizer.ts';

describe('whitespaceTokenizer', () => {
  it.each([
    { text: 'hello world', expected: ['hello', ' world'] },
    { text: 'hello', expected: ['hello'] },
    { text: 'hello world test', expected: ['hello', ' world', ' test'] },
    { text: '  hello  world ', expected: [' ', ' hello', ' ', ' world', ' '] },
    { text: 'hello   world', expected: ['hello', ' ', ' ', ' world'] },
    { text: 'hello\tworld', expected: ['hello', '\tworld'] },
    { text: 'hello\nworld', expected: ['hello', '\nworld'] },
    { text: 'hello\n\nworld', expected: ['hello', '\n', '\nworld'] },
    { text: ' hello ', expected: [' hello', ' '] },
    { text: '\t\nhello', expected: ['\t', '\nhello'] },
    { text: '  ', expected: [' ', ' '] },
    { text: '', expected: [] },
    { text: 'a b c d', expected: ['a', ' b', ' c', ' d'] },
  ])('tokenizes "$text" to $expected', ({ text, expected }) => {
    expect(whitespaceTokenizer(text)).toStrictEqual(expected);
  });
});
