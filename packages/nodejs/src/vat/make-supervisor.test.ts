import '@ocap/repo-tools/test-utils/mock-endoify';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@metamask/logger', () => ({
  makeStreamTransport: vi.fn(() => ({ id: 'transport' })),
  Logger: vi.fn(() => ({ debug: vi.fn() })),
}));

vi.mock('@metamask/ocap-kernel', () => ({
  VatSupervisor: vi.fn(() => ({ id: 'test-vat-id' })),
}));

vi.mock('./streams.ts', () => ({
  makeStreams: vi.fn(async () => ({
    kernelStream: { id: 'kernel' },
    loggerStream: { id: 'logger' },
  })),
}));

vi.mock('./fetch-blob.ts', () => ({
  fetchBlob: vi.fn(),
}));

describe('makeNodeJsVatSupervisor', () => {
  it('returns an object with logger and supervisor properties', async () => {
    const { makeNodeJsVatSupervisor } = await import('./make-supervisor.ts');
    const result = await makeNodeJsVatSupervisor('test-vat', 'test-log');
    expect(result).toHaveProperty('logger');
    expect(result).toHaveProperty('supervisor');
  });
});
