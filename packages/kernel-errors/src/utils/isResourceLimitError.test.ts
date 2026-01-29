import { describe, it, expect } from 'vitest';

import { isResourceLimitError } from './isResourceLimitError.ts';
import { ResourceLimitError } from '../errors/ResourceLimitError.ts';

describe('isResourceLimitError', () => {
  describe('without limitType parameter', () => {
    it('returns true for ResourceLimitError', () => {
      const error = new ResourceLimitError('limit exceeded');
      expect(isResourceLimitError(error)).toBe(true);
    });

    it('returns true for ResourceLimitError with any limitType', () => {
      const connectionError = new ResourceLimitError('connection limit', {
        data: { limitType: 'connection' },
      });
      const rateError = new ResourceLimitError('rate limit', {
        data: { limitType: 'connectionRate' },
      });

      expect(isResourceLimitError(connectionError)).toBe(true);
      expect(isResourceLimitError(rateError)).toBe(true);
    });

    it('returns false for regular Error', () => {
      const error = new Error('some error');
      expect(isResourceLimitError(error)).toBe(false);
    });

    it('returns false for null', () => {
      expect(isResourceLimitError(null)).toBe(false);
    });

    it('returns false for undefined', () => {
      expect(isResourceLimitError(undefined)).toBe(false);
    });

    it('returns false for non-error objects', () => {
      expect(isResourceLimitError({ message: 'fake error' })).toBe(false);
    });
  });

  describe('with limitType parameter', () => {
    it('returns true when limitType matches', () => {
      const error = new ResourceLimitError('connection limit', {
        data: { limitType: 'connection' },
      });
      expect(isResourceLimitError(error, 'connection')).toBe(true);
    });

    it('returns false when limitType does not match', () => {
      const error = new ResourceLimitError('connection limit', {
        data: { limitType: 'connection' },
      });
      expect(isResourceLimitError(error, 'connectionRate')).toBe(false);
    });

    it('returns false when error has no limitType', () => {
      const error = new ResourceLimitError('limit exceeded');
      expect(isResourceLimitError(error, 'connection')).toBe(false);
    });

    it('returns false for non-ResourceLimitError even with matching-like data', () => {
      const error = new Error('some error');
      expect(isResourceLimitError(error, 'connection')).toBe(false);
    });

    it.each([
      'connection',
      'connectionRate',
      'messageSize',
      'messageRate',
    ] as const)('correctly identifies %s limitType', (limitType) => {
      const error = new ResourceLimitError('limit exceeded', {
        data: { limitType },
      });
      expect(isResourceLimitError(error, limitType)).toBe(true);
    });
  });
});
