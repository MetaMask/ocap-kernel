import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { LaunchVat } from './LaunchVat.jsx';
import { useKernelActions } from '../hooks/useKernelActions.js';
import { isValidBundleUrl } from '../utils.js';

vi.mock('../hooks/useKernelActions.js', () => ({
  useKernelActions: vi.fn(),
}));

vi.mock('../utils.js', () => ({
  isValidBundleUrl: vi.fn(),
}));

describe('LaunchVat Component', () => {
  const mockLaunchVat = vi.fn();

  beforeEach(() => {
    cleanup();
    vi.mocked(useKernelActions).mockReturnValue({
      launchVat: mockLaunchVat,
      sendKernelCommand: vi.fn(),
      terminateAllVats: vi.fn(),
      clearState: vi.fn(),
      reload: vi.fn(),
      updateClusterConfig: vi.fn(),
    });
  });

  it('renders inputs and button with initial values', () => {
    render(<LaunchVat />);
    const vatNameInput = screen.getByPlaceholderText('Vat Name');
    const bundleUrlInput = screen.getByPlaceholderText('Bundle URL');
    const launchButton = screen.getByRole('button', { name: 'Launch Vat' });
    expect(vatNameInput).toBeInTheDocument();
    expect(bundleUrlInput).toBeInTheDocument();
    expect(vatNameInput).toHaveValue('');
    expect(bundleUrlInput).toHaveValue(
      'http://localhost:3000/sample-vat.bundle',
    );
    expect(launchButton).toBeDisabled();
  });

  it('disables the button when vat name is empty', async () => {
    vi.mocked(isValidBundleUrl).mockReturnValue(true);
    render(<LaunchVat />);
    const vatNameInput = screen.getByPlaceholderText('Vat Name');
    const launchButton = screen.getByRole('button', { name: 'Launch Vat' });
    await userEvent.clear(vatNameInput);
    expect(launchButton).toBeDisabled();
  });

  it('disables the button when bundle URL is invalid', async () => {
    vi.mocked(isValidBundleUrl).mockReturnValue(false);
    render(<LaunchVat />);
    const vatNameInput = screen.getByPlaceholderText('Vat Name');
    const bundleUrlInput = screen.getByPlaceholderText('Bundle URL');
    const launchButton = screen.getByRole('button', { name: 'Launch Vat' });
    await userEvent.type(vatNameInput, 'MyVat');
    await userEvent.clear(bundleUrlInput);
    await userEvent.type(bundleUrlInput, 'invalid-url');
    expect(launchButton).toBeDisabled();
  });

  it('enables the button when vat name and valid bundle URL are provided', async () => {
    vi.mocked(isValidBundleUrl).mockReturnValue(true);
    render(<LaunchVat />);
    const vatNameInput = screen.getByPlaceholderText('Vat Name');
    const bundleUrlInput = screen.getByPlaceholderText('Bundle URL');
    const launchButton = screen.getByRole('button', { name: 'Launch Vat' });
    await userEvent.type(vatNameInput, 'MyVat');
    await userEvent.clear(bundleUrlInput);
    await userEvent.type(bundleUrlInput, 'http://localhost:3000/valid.bundle');
    expect(launchButton).toBeEnabled();
  });

  it('calls launchVat with correct arguments when button is clicked', async () => {
    vi.mocked(isValidBundleUrl).mockReturnValue(true);
    render(<LaunchVat />);
    const vatNameInput = screen.getByPlaceholderText('Vat Name');
    const bundleUrlInput = screen.getByPlaceholderText('Bundle URL');
    const launchButton = screen.getByRole('button', { name: 'Launch Vat' });
    const vatName = 'TestVat';
    const bundleUrl = 'http://localhost:3000/test.bundle';
    await userEvent.type(vatNameInput, vatName);
    await userEvent.clear(bundleUrlInput);
    await userEvent.type(bundleUrlInput, bundleUrl);
    await userEvent.click(launchButton);
    expect(mockLaunchVat).toHaveBeenCalledWith(bundleUrl, vatName);
  });
});
