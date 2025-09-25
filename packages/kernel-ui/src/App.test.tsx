import { setupOcapKernelMock } from '@ocap/test-utils';
import { render, screen, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import type { StreamState } from './hooks/useStream.ts';

setupOcapKernelMock();

vi.mock('./hooks/useStream.ts', () => ({
  useStream: vi.fn(),
}));

vi.mock('./hooks/useDarkMode.ts', () => ({
  useDarkMode: vi.fn(),
}));

describe('App', () => {
  beforeEach(() => {
    cleanup();
  });

  it('renders an error message if there is an error connecting to the kernel', async () => {
    const { useStream } = await import('./hooks/useStream.ts');
    vi.mocked(useStream).mockReturnValue({
      callKernelMethod: undefined,
      error: new Error('Test kernel connection error'),
    } as unknown as StreamState);
    const { App } = await import('./App.tsx');
    render(<App />);
    expect(
      screen.getByText(/Error connecting to kernel:/u),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Test kernel connection error/u),
    ).toBeInTheDocument();
  });

  it('renders "Connecting to kernel..." when callKernelMethod is not yet available and no error is present', async () => {
    const { useStream } = await import('./hooks/useStream.ts');
    vi.mocked(useStream).mockReturnValue({
      callKernelMethod: undefined,
      error: undefined,
    } as unknown as StreamState);
    const { App } = await import('./App.tsx');
    render(<App />);
    expect(screen.getByText('Connecting to kernel...')).toBeInTheDocument();
  });

  it('renders the main UI when callKernelMethod is available and no error is present', async () => {
    const { useStream } = await import('./hooks/useStream.ts');
    vi.mocked(useStream).mockReturnValue({
      callKernelMethod: vi.fn(),
      error: undefined,
    } as unknown as StreamState);
    const { App } = await import('./App.tsx');
    render(<App />);
    expect(screen.getByText('Control Panel')).toBeInTheDocument();
  });

  it('renders all tab labels including the new Remote Comms tab', async () => {
    const { useStream } = await import('./hooks/useStream.ts');
    vi.mocked(useStream).mockReturnValue({
      callKernelMethod: vi.fn(),
      error: undefined,
    } as unknown as StreamState);
    const { App } = await import('./App.tsx');
    render(<App />);

    // Check that all tabs are rendered
    expect(screen.getByText('Control Panel')).toBeInTheDocument();
    expect(screen.getByText('Object Registry')).toBeInTheDocument();
    expect(screen.getByText('Database Inspector')).toBeInTheDocument();
    expect(screen.getByText('Remote Comms')).toBeInTheDocument();
  });
});
