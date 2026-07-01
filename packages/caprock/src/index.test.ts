import { describe, it, expect } from 'vitest';

import { caprockOutputPath } from './session.ts';

describe('caprockOutputPath', () => {
  it('appends .caprock.jsonl to a .jsonl path', () => {
    expect(
      caprockOutputPath('/home/user/.claude/projects/foo/abc123.jsonl'),
    ).toBe('/home/user/.claude/projects/foo/abc123.caprock.jsonl');
  });

  it('appends .caprock.jsonl to a non-.jsonl path', () => {
    expect(caprockOutputPath('/some/transcript')).toBe(
      '/some/transcript.caprock.jsonl',
    );
  });
});
