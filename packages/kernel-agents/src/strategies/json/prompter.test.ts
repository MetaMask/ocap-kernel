import '@ocap/repo-tools/test-utils/mock-endoify';

import { describe, it, expect } from 'vitest';

import { makePrompter } from './prompter.ts';

describe('makePrompter', () => {
  it('should get the prompt and prefix', () => {
    const prompter = makePrompter();
    const {
      prompt,
      readerArgs: { prefix },
    } = prompter([]);
    expect(typeof prompt).toBe('string');
    expect(typeof prefix).toBe('string');
  });
});
