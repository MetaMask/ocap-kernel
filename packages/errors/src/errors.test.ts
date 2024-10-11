import { describe, it, expect } from 'vitest';

import { ErrorCode } from './constants.js';
import {
  VatAlreadyExistsError,
  VatNotFoundError,
  SupervisorReadError,
  VatReadError,
  CapTPConnectionExistsError,
  CapTPConnectionNotFoundError,
  VatDeletedError,
} from './errors.js';

describe('Custom Errors', () => {
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

  describe('SupervisorReadError', () => {
    it('should create a SupervisorReadError with the correct properties', () => {
      const error = new SupervisorReadError(
        mockSupervisorId,
        mockOriginalError,
      );
      expect(error).toBeInstanceOf(SupervisorReadError);
      expect(error.code).toBe(ErrorCode.SupervisorReadError);
      expect(error.message).toBe('Unexpected read error from Supervisor.');
      expect(error.data).toStrictEqual({ supervisorId: mockSupervisorId });
      expect(error.cause).toBe(mockOriginalError);
    });
  });

  describe('VatReadError', () => {
    it('should create a VatReadError with the correct properties', () => {
      const error = new VatReadError(mockVatId, mockOriginalError);
      expect(error).toBeInstanceOf(VatReadError);
      expect(error.code).toBe(ErrorCode.VatReadError);
      expect(error.message).toBe('Unexpected read error from Vat.');
      expect(error.data).toStrictEqual({ vatId: mockVatId });
      expect(error.cause).toBe(mockOriginalError);
    });
  });

  describe('CapTPConnectionExistsError', () => {
    it('should create a CapTPConnectionExistsError with the correct properties', () => {
      const error = new CapTPConnectionExistsError(mockVatId);
      expect(error).toBeInstanceOf(CapTPConnectionExistsError);
      expect(error.code).toBe(ErrorCode.CaptpConnectionExists);
      expect(error.message).toBe('Vat already has a CapTP connection.');
      expect(error.data).toStrictEqual({ vatId: mockVatId });
      expect(error.cause).toBeUndefined();
    });
  });

  describe('CapTPConnectionNotFoundError', () => {
    it('should create a CapTPConnectionNotFoundError with the correct properties', () => {
      const error = new CapTPConnectionNotFoundError(mockVatId);
      expect(error).toBeInstanceOf(CapTPConnectionNotFoundError);
      expect(error.code).toBe(ErrorCode.CaptpConnectionNotFound);
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
