import { ResourceLimitError } from '@metamask/kernel-errors';
import { describe, it, expect } from 'vitest';

import { DEFAULT_MAX_MESSAGE_SIZE_BYTES } from './constants.ts';
import {
  makeMessageSizeValidator,
  makeConnectionLimitChecker,
} from './validators.ts';

describe('validators', () => {
  describe('makeMessageSizeValidator', () => {
    it('creates a validator with default max size', () => {
      const validator = makeMessageSizeValidator();
      const smallMessage = 'hello';

      expect(() => validator(smallMessage)).not.toThrow();
    });

    it('creates a validator with custom max size', () => {
      const validator = makeMessageSizeValidator(10);
      const smallMessage = 'hi';

      expect(() => validator(smallMessage)).not.toThrow();
    });

    it('allows messages within the size limit', () => {
      const validator = makeMessageSizeValidator(100);
      const message = 'a'.repeat(100);

      expect(() => validator(message)).not.toThrow();
    });

    it('throws ResourceLimitError for messages exceeding size limit', () => {
      const validator = makeMessageSizeValidator(10);
      const largeMessage = 'a'.repeat(20);

      expect(() => validator(largeMessage)).toThrow(ResourceLimitError);
    });

    it('includes correct error data when throwing', () => {
      const maxSize = 10;
      const validator = makeMessageSizeValidator(maxSize);
      const largeMessage = 'a'.repeat(20);

      let thrownError: ResourceLimitError | undefined;
      try {
        validator(largeMessage);
      } catch (error) {
        thrownError = error as ResourceLimitError;
      }

      expect(thrownError).toBeInstanceOf(ResourceLimitError);
      expect(thrownError?.data).toStrictEqual({
        limitType: 'messageSize',
        current: 20,
        limit: maxSize,
      });
    });

    it('calculates byte size correctly for multi-byte characters', () => {
      const validator = makeMessageSizeValidator(10);
      // Each emoji is 4 bytes in UTF-8
      const emojiMessage = '😀😀😀'; // 12 bytes

      expect(() => validator(emojiMessage)).toThrow(ResourceLimitError);
    });

    it('uses default max size constant', () => {
      const validator = makeMessageSizeValidator();
      // Create a message just under the default limit
      const message = 'a'.repeat(DEFAULT_MAX_MESSAGE_SIZE_BYTES - 1);

      expect(() => validator(message)).not.toThrow();
    });
  });

  describe('makeConnectionLimitChecker', () => {
    it('creates a checker that allows connections under the limit', () => {
      const checker = makeConnectionLimitChecker(10, () => 5);

      expect(() => checker()).not.toThrow();
    });

    it('throws ResourceLimitError when at the limit', () => {
      const checker = makeConnectionLimitChecker(10, () => 10);

      expect(() => checker()).toThrow(ResourceLimitError);
    });

    it('throws ResourceLimitError when over the limit', () => {
      const checker = makeConnectionLimitChecker(10, () => 15);

      expect(() => checker()).toThrow(ResourceLimitError);
    });

    it('includes correct error data when throwing', () => {
      const maxConnections = 5;
      const currentConnections = 5;
      const checker = makeConnectionLimitChecker(
        maxConnections,
        () => currentConnections,
      );

      let thrownError: ResourceLimitError | undefined;
      try {
        checker();
      } catch (error) {
        thrownError = error as ResourceLimitError;
      }

      expect(thrownError).toBeInstanceOf(ResourceLimitError);
      expect(thrownError?.data).toStrictEqual({
        limitType: 'connection',
        current: currentConnections,
        limit: maxConnections,
      });
    });

    it('calls getActiveConnectionCount on each check', () => {
      let connectionCount = 0;
      const checker = makeConnectionLimitChecker(10, () => connectionCount);

      expect(() => checker()).not.toThrow();

      connectionCount = 10;
      expect(() => checker()).toThrow(ResourceLimitError);

      connectionCount = 5;
      expect(() => checker()).not.toThrow();
    });

    it('allows zero connections', () => {
      const checker = makeConnectionLimitChecker(10, () => 0);

      expect(() => checker()).not.toThrow();
    });

    it('handles limit of 1', () => {
      const checker = makeConnectionLimitChecker(1, () => 0);
      expect(() => checker()).not.toThrow();

      const checkerAtLimit = makeConnectionLimitChecker(1, () => 1);
      expect(() => checkerAtLimit()).toThrow(ResourceLimitError);
    });
  });
});
