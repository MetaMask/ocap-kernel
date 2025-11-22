import '@ocap/repo-tools/test-utils/mock-endoify';

import { describe, expect, it } from 'vitest';

import { defaultJudgment } from './task.ts';

describe('defaultJudgment', () => {
  it('returns true', () => {
    expect(defaultJudgment(1)).toBe(true);
  });
});
