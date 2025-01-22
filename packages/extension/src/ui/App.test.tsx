import '@ocap/test-utils/mock-endoify';
import { define } from '@metamask/superstruct';
import type { VatId, VatConfig } from '@ocap/kernel';
import { render, screen, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import type { StreamState } from './hooks/useStream.js';

const isVatId = vi.fn(
  (input: unknown): input is VatId => typeof input === 'string',
);

const isVatConfig = vi.fn(
  (input: unknown): input is VatConfig => typeof input === 'object',
);

vi.mock('@ocap/kernel', () => ({
  isVatId,
  isVatConfig,
  VatCommandMethod: {
    ping: 'ping',
  },
  KernelCommandMethod: {},
  VatIdStruct: define<VatId>('VatId', isVatId),
  VatConfigStruct: define<VatConfig>('VatConfig', isVatConfig),
}));

vi.mock('./hooks/useStream.js', () => ({
  useStream: vi.fn(),
}));

vi.mock('./App.module.css', () => ({
  default: {
    panel: 'panel-class',
    error: 'error-class',
    leftPanel: 'left-panel-class',
    rightPanel: 'right-panel-class',
    headerSection: 'header-section-class',
  },
}));

describe('App', () => {
  beforeEach(() => {
    cleanup();
  });

  it('renders an error message if there is an error connecting to the kernel', async () => {
    const { useStream } = await import('./hooks/useStream.js');
    vi.mocked(useStream).mockReturnValue({
      sendMessage: undefined,
      error: new Error('Test kernel connection error'),
    } as unknown as StreamState);
    const { App } = await import('./App.jsx');
    render(<App />);
    expect(
      screen.getByText(/Error connecting to kernel:/u),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Test kernel connection error/u),
    ).toBeInTheDocument();
  });

  it('renders "Connecting to kernel..." when sendMessage is not yet available and no error is present', async () => {
    const { useStream } = await import('./hooks/useStream.js');
    vi.mocked(useStream).mockReturnValue({
      sendMessage: undefined,
      error: undefined,
    } as unknown as StreamState);
    const { App } = await import('./App.jsx');
    render(<App />);
    expect(screen.getByText('Connecting to kernel...')).toBeInTheDocument();
  });

  it('renders the main UI when sendMessage is available and no error is present', async () => {
    const { useStream } = await import('./hooks/useStream.js');
    vi.mocked(useStream).mockReturnValue({
      sendMessage: vi.fn(),
      error: undefined,
    } as unknown as StreamState);
    const { App } = await import('./App.jsx');
    render(<App />);
    expect(screen.getByText('Kernel Vats')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Launch Vat' }),
    ).toBeInTheDocument();
  });
});
