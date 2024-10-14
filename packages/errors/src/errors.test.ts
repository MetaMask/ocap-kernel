import { describe, it, expect } from 'vitest';

import {
  VatAlreadyExistsError,
  VatNotFoundError,
  StreamReadError,
  VatCapTpConnectionExistsError,
  VatCapTpConnectionNotFoundError,
  VatDeletedError,
} from './errors.js';
import { ErrorCode } from './types.js';

describe('Errors classes', () => {
  const mockVatId = 'mockVatId';
  const mockSupervisorId = 'mockSupervisorId';
  const mockOriginalError = new Error('Original error');

  describe('VatAlreadyExistsError', () => {
    it('should create a VatAlreadyExistsError with the correct properties', () => {
      const error = new VatAlreadyExistsError(mockVatId);
      expect(error).toBeInstanceOf(VatAlreadyExistsError);
      expect(error.code).toBe(ErrorCode.VatAlreadyExists);
      expect(error.message).toBe('Vat already exists.');
      expect(error.data).toStrictEqual({ vatId: mockVatId });
      expect(error.cause).toBeUndefined();
    });
  });

  describe('VatNotFoundError', () => {
    it('should create a VatNotFoundError with the correct properties', () => {
      const error = new VatNotFoundError(mockVatId);
      expect(error).toBeInstanceOf(VatNotFoundError);
      expect(error.code).toBe(ErrorCode.VatNotFound);
      expect(error.message).toBe('Vat does not exist.');
      expect(error.data).toStrictEqual({ vatId: mockVatId });
      expect(error.cause).toBeUndefined();
    });
  });

  describe('StreamReadError', () => {
    it('should create a StreamReadError for Supervisor with the correct properties', () => {
      const error = new StreamReadError(
        { supervisorId: mockSupervisorId },
        mockOriginalError,
      );
      expect(error).toBeInstanceOf(StreamReadError);
      expect(error.code).toBe(ErrorCode.StreamReadError);
      expect(error.message).toBe('Unexpected stream read error.');
      expect(error.data).toStrictEqual({ supervisorId: mockSupervisorId });
      expect(error.cause).toBe(mockOriginalError);
    });

    it('should create a StreamReadError for Vat with the correct properties', () => {
      const error = new StreamReadError(
        { vatId: mockVatId },
        mockOriginalError,
      );
      expect(error).toBeInstanceOf(StreamReadError);
      expect(error.code).toBe(ErrorCode.StreamReadError);
      expect(error.message).toBe('Unexpected stream read error.');
      expect(error.data).toStrictEqual({ vatId: mockVatId });
      expect(error.cause).toBe(mockOriginalError);
    });
  });

  describe('VatCapTpConnectionExistsError', () => {
    it('should create a VatCapTpConnectionExistsError with the correct properties', () => {
      const error = new VatCapTpConnectionExistsError(mockVatId);
      expect(error).toBeInstanceOf(VatCapTpConnectionExistsError);
      expect(error.code).toBe(ErrorCode.VatCapTpConnectionExists);
      expect(error.message).toBe('Vat already has a CapTP connection.');
      expect(error.data).toStrictEqual({ vatId: mockVatId });
      expect(error.cause).toBeUndefined();
    });
  });

  describe('VatCapTpConnectionNotFoundError', () => {
    it('should create a VatCapTpConnectionNotFoundError with the correct properties', () => {
      const error = new VatCapTpConnectionNotFoundError(mockVatId);
      expect(error).toBeInstanceOf(VatCapTpConnectionNotFoundError);
      expect(error.code).toBe(ErrorCode.VatCapTpConnectionNotFound);
      expect(error.message).toBe('Vat does not have a CapTP connection.');
      expect(error.data).toStrictEqual({ vatId: mockVatId });
      expect(error.cause).toBeUndefined();
    });
  });

  describe('VatDeletedError', () => {
    it('should create a VatDeletedError with the correct properties', () => {
      const error = new VatDeletedError(mockVatId);
      expect(error).toBeInstanceOf(VatDeletedError);
      expect(error.code).toBe(ErrorCode.VatDeleted);
      expect(error.message).toBe('Vat was deleted.');
      expect(error.data).toStrictEqual({ vatId: mockVatId });
      expect(error.cause).toBeUndefined();
    });
  });
});
