import { describe, it, expect } from 'vitest';

import { isWrappedVatMessage, isCapTpMessage } from './type-guards.js';
import type { CapTpMessage, WrappedVatMessage } from './types.js';
import { Command } from './types.js';

describe('type-guards', () => {
  describe('isWrappedVatMessage', () => {
    it('returns true for a valid wrapped vat message', () => {
      const value: WrappedVatMessage = {
        id: 'some-id',
        message: {
          type: Command.Ping,
          data: null,
        },
      };
      expect(isWrappedVatMessage(value)).toBe(true);
    });

    it('returns false for an invalid wrapped vat message', () => {
      const value1 = 123;
      const value2 = { id: true, message: {} };
      const value3 = { id: 'some-id', message: null };

      expect(isWrappedVatMessage(value1)).toBe(false);
      expect(isWrappedVatMessage(value2)).toBe(false);
      expect(isWrappedVatMessage(value3)).toBe(false);
    });

    it('returns false for a wrapped vat message with invalid id', () => {
      const value = {
        id: 123,
        message: {
          type: Command.Ping,
          data: null,
        },
      };
      expect(isWrappedVatMessage(value)).toBe(false);
    });

    it('returns false for a wrapped vat message with invalid message', () => {
      const value1 = { id: 'some-id' };
      const value2 = { id: 'some-id', message: 123 };

      expect(isWrappedVatMessage(value1)).toBe(false);
      expect(isWrappedVatMessage(value2)).toBe(false);
    });

    it('returns false for a wrapped vat message with invalid type in the message', () => {
      const value = {
        id: 'some-id',
        message: {
          type: 123,
          data: null,
        },
      };
      expect(isWrappedVatMessage(value)).toBe(false);
    });

    it('returns false for a wrapped vat message with invalid data in the message', () => {
      const value1 = { id: 'some-id' };
      const value2 = { id: 'some-id', message: null };

      expect(isWrappedVatMessage(value1)).toBe(false);
      expect(isWrappedVatMessage(value2)).toBe(false);
    });
  });

  describe('isCapTpMessage', () => {
    it('returns true for a valid cap tp message', () => {
      const value: CapTpMessage = {
        type: 'CTP_some-type',
        epoch: 123,
      };
      expect(isCapTpMessage(value)).toBe(true);
    });

    it('returns false for an invalid cap tp message', () => {
      const value1 = { type: true, epoch: null };
      const value2 = { type: 'some-type' };

      expect(isCapTpMessage(value1)).toBe(false);
      expect(isCapTpMessage(value2)).toBe(false);
    });

    it('returns false for a cap tp message with invalid type', () => {
      const value = {
        type: 123,
        epoch: null,
      };
      expect(isCapTpMessage(value)).toBe(false);
    });

    it('returns false for a cap tp message with invalid epoch', () => {
      const value1 = { type: 'CTP_some-type' };
      const value2 = { type: 'CTP_some-type', epoch: true };

      expect(isCapTpMessage(value1)).toBe(false);
      expect(isCapTpMessage(value2)).toBe(false);
    });
  });
});
