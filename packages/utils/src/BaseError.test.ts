import { describe, it, expect } from 'vitest';

import { BaseError } from './BaseError.js';

describe('BaseError', () => {
  it('creates a BaseError with the correct properties', () => {
    const error = new BaseError('BASE_ERROR_CODE', 'This is a base error.', {
      additional: 'info',
    });

    expect(error).toBeInstanceOf(BaseError);
    expect(error.code).toBe('BASE_ERROR_CODE');
    expect(error.message).toBe('This is a base error.');
    expect(error.data).toMatchObject({ additional: 'info' });
    expect(error.name).toBe('BaseError');
  });

  it('creates a BaseError without optional data', () => {
    const error = new BaseError(
      'BASE_ERROR_NO_DATA',
      'This error has no data.',
    );

    expect(error).toBeInstanceOf(BaseError);
    expect(error.code).toBe('BASE_ERROR_NO_DATA');
    expect(error.message).toBe('This error has no data.');
    expect(error.data).toBeUndefined();
    expect(error.name).toBe('BaseError');
  });
});
