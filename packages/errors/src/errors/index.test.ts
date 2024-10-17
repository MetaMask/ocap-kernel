import { describe, it, expect } from 'vitest';

import { errorClasses } from './index.js';
import { ErrorCode } from '../constants.js';

describe('errorClasses', () => {
  it('should contain all keys from ErrorCode', () => {
    const errorCodes = Object.values(ErrorCode);
    const errorClassKeys = Object.keys(errorClasses);
    expect(errorClassKeys).toStrictEqual(errorCodes);
  });
});
