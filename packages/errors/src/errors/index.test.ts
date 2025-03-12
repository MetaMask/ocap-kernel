import { describe, it, expect } from 'vitest';

import { errorClasses } from './index.ts';
import { ErrorCode } from '../constants.ts';

describe('errorClasses', () => {
  it('should contain all keys from ErrorCode', () => {
    const errorCodes = Object.values(ErrorCode);
    const errorClassKeys = Object.keys(errorClasses);
    expect(errorClassKeys).toStrictEqual(errorCodes);
  });
});
