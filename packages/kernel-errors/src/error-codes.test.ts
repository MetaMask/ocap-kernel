import { describe, it, expect } from 'vitest';

import { SampleGenerationError as BundleableSampleGenerationError } from './bundleable/SampleGenerationError.ts';
import { ErrorCode, isSampleGenerationError } from './error-codes.ts';
import { SampleGenerationError as MainSampleGenerationError } from './errors/SampleGenerationError.ts';

describe('error-codes', () => {
  describe('isSampleGenerationError', () => {
    it('returns true for bundleable SampleGenerationError', () => {
      const error = new BundleableSampleGenerationError(
        'invalid sample',
        new Error('parse failed'),
      );
      expect(isSampleGenerationError(error)).toBe(true);
    });

    it('returns true for main SampleGenerationError', () => {
      const error = new MainSampleGenerationError(
        'invalid sample',
        new Error('parse failed'),
      );
      expect(isSampleGenerationError(error)).toBe(true);
    });

    it('returns false for plain Error', () => {
      const error = new Error('some error');
      expect(isSampleGenerationError(error)).toBe(false);
    });

    it('returns false for Error with different code', () => {
      const error = new Error('some error');
      (error as Error & { code: string }).code = ErrorCode.AbortError;
      expect(isSampleGenerationError(error)).toBe(false);
    });

    it('returns false for non-Error values', () => {
      expect(isSampleGenerationError(null)).toBe(false);
      expect(isSampleGenerationError(undefined)).toBe(false);
      expect(isSampleGenerationError('error string')).toBe(false);
      expect(
        isSampleGenerationError({ code: ErrorCode.SampleGenerationError }),
      ).toBe(false);
    });

    it('narrows type correctly', () => {
      const error = new BundleableSampleGenerationError(
        'test sample',
        new Error('cause'),
      );

      expect(isSampleGenerationError(error)).toBe(true);
      // After the check above passes, TypeScript allows accessing these properties
      expect(error.code).toBe(ErrorCode.SampleGenerationError);
      expect(error.data.sample).toBe('test sample');
    });
  });
});
