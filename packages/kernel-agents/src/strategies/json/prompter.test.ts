import '@ocap/repo-tools/test-utils/mock-endoify';

import { describe, it, expect } from 'vitest';

import { makePrompter } from './prompter.ts';

describe('makePrompter', () => {
  it('returns prompt and prefix', () => {
    const prompter = makePrompter();
    const { prompt, readerArgs } = prompter([]);
    expect(typeof prompt).toBe('string');
    expect(typeof readerArgs.prefix).toBe('string');
  });
});
