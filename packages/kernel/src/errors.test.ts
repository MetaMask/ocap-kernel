import { describe, it, expect } from 'vitest';

import {
  VatAlreadyExistsError,
  VatNotFoundError,
  SupervisorReadError,
  VatReadError,
  CapTPConnectionExistsError,
  CapTPConnectionNotFoundError,
  VatDeletedError,
} from './errors.js';

describe('Custom Error Classes', () => {
  it('creates a VatAlreadyExistsError with the correct properties', () => {
    const error = new VatAlreadyExistsError('vat123');
    expect(error).toBeInstanceOf(VatAlreadyExistsError);
    expect(error.code).toBe('VAT_ALREADY_EXISTS');
    expect(error.message).toBe('Vat already exists.');
    expect(error.data).toMatchObject({ vatId: 'vat123' });
  });

  it('creates a VatNotFoundError with the correct properties', () => {
    const error = new VatNotFoundError('vat456');
    expect(error).toBeInstanceOf(VatNotFoundError);
    expect(error.code).toBe('VAT_NOT_FOUND');
    expect(error.message).toBe('Vat does not exist.');
    expect(error.data).toMatchObject({ vatId: 'vat456' });
  });

  it('creates a SupervisorReadError with the correct properties', () => {
    const originalError = new Error('Original error');
    const error = new SupervisorReadError('supervisor123', originalError);
    expect(error).toBeInstanceOf(SupervisorReadError);
    expect(error.code).toBe('SUPERVISOR_READ_ERROR');
    expect(error.message).toBe('Unexpected read error from Supervisor.');
    expect(error.data).toMatchObject({
      supervisorId: 'supervisor123',
      originalError,
    });
  });

  it('creates a VatReadError with the correct properties', () => {
    const originalError = new Error('Original error');
    const error = new VatReadError('vat789', originalError);
    expect(error).toBeInstanceOf(VatReadError);
    expect(error.code).toBe('VAT_READ_ERROR');
    expect(error.message).toBe('Unexpected read error from Vat.');
    expect(error.data).toMatchObject({
      vatId: 'vat789',
      originalError,
    });
  });

  it('creates a CapTPConnectionExistsError with the correct properties', () => {
    const error = new CapTPConnectionExistsError('vat987');
    expect(error).toBeInstanceOf(CapTPConnectionExistsError);
    expect(error.code).toBe('CAPTP_CONNECTION_EXISTS');
    expect(error.message).toBe('Vat already has a CapTP connection.');
    expect(error.data).toMatchObject({ vatId: 'vat987' });
  });

  it('creates a CapTPConnectionNotFoundError with the correct properties', () => {
    const error = new CapTPConnectionNotFoundError('vat654');
    expect(error).toBeInstanceOf(CapTPConnectionNotFoundError);
    expect(error.code).toBe('CAPTP_CONNECTION_NOT_FOUND');
    expect(error.message).toBe('Vat does not have a CapTP connection.');
    expect(error.data).toMatchObject({ vatId: 'vat654' });
  });

  it('creates a VatDeletedError with the correct properties', () => {
    const error = new VatDeletedError('vat321');
    expect(error).toBeInstanceOf(VatDeletedError);
    expect(error.code).toBe('VAT_DELETED');
    expect(error.message).toBe('Vat was deleted.');
    expect(error.data).toMatchObject({ vatId: 'vat321' });
  });
});
