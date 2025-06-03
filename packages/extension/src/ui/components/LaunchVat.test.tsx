import { render, screen, cleanup } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { LaunchVat } from './LaunchVat.tsx';
import { usePanelContext } from '../context/PanelContext.tsx';
import type { PanelContextType } from '../context/PanelContext.tsx';
import { useKernelActions } from '../hooks/useKernelActions.ts';
import { isValidBundleUrl } from '../utils.ts';

vi.mock('../context/PanelContext.tsx', () => ({
  usePanelContext: vi.fn(),
}));

vi.mock('../hooks/useKernelActions.ts', () => ({
  useKernelActions: vi.fn(),
}));

vi.mock('../utils.ts', () => ({
  isValidBundleUrl: vi.fn(),
}));

describe('LaunchVat Component', () => {
  const mockLaunchVat = vi.fn();

  beforeEach(() => {
    cleanup();
    vi.mocked(useKernelActions).mockReturnValue({
      launchVat: mockLaunchVat,
      terminateAllVats: vi.fn(),
      clearState: vi.fn(),
      reload: vi.fn(),
      launchSubcluster: vi.fn(),
      collectGarbage: vi.fn(),
    });

    vi.mocked(usePanelContext).mockReturnValue({
      status: {
        subclusters: [],
        rogueVats: [],
      },
    } as unknown as PanelContextType);
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
    expect(mockLaunchVat).toHaveBeenCalledWith(bundleUrl, vatName, undefined);
  });

  it('renders subcluster select with available options', () => {
    const mockSubclusters = [
      { id: 'subcluster1', vats: [] },
      { id: 'subcluster2', vats: [] },
    ];
    vi.mocked(usePanelContext).mockReturnValue({
      status: {
        subclusters: mockSubclusters,
        rogueVats: [],
      },
    } as unknown as PanelContextType);

    render(<LaunchVat />);
    const subclusterSelect = screen.getByRole('combobox');
    expect(subclusterSelect).toBeInTheDocument();
    expect(subclusterSelect).toHaveValue('');

    const options = screen.getAllByRole('option');
    expect(options).toHaveLength(3); // Default "No Subcluster" + 2 subclusters
    expect(options[0]).toHaveTextContent('No Subcluster');
    expect(options[1]).toHaveTextContent('subcluster1');
    expect(options[2]).toHaveTextContent('subcluster2');
  });

  it('calls launchVat with selected subcluster when provided', async () => {
    vi.mocked(isValidBundleUrl).mockReturnValue(true);
    const mockSubclusters = [{ id: 'subcluster1', vats: [] }];
    vi.mocked(usePanelContext).mockReturnValue({
      status: {
        subclusters: mockSubclusters,
        rogueVats: [],
      },
    } as unknown as PanelContextType);

    render(<LaunchVat />);
    const vatNameInput = screen.getByPlaceholderText('Vat Name');
    const bundleUrlInput = screen.getByPlaceholderText('Bundle URL');
    const subclusterSelect = screen.getByRole('combobox');
    const launchButton = screen.getByRole('button', { name: 'Launch Vat' });

    await userEvent.type(vatNameInput, 'TestVat');
    await userEvent.clear(bundleUrlInput);
    await userEvent.type(bundleUrlInput, 'http://localhost:3000/test.bundle');
    await userEvent.selectOptions(subclusterSelect, 'subcluster1');
    await userEvent.click(launchButton);

    expect(mockLaunchVat).toHaveBeenCalledWith(
      'http://localhost:3000/test.bundle',
      'TestVat',
      'subcluster1',
    );
  });

  it('updates isDisabled state when inputs change', async () => {
    vi.mocked(isValidBundleUrl).mockReturnValue(true);
    render(<LaunchVat />);
    const vatNameInput = screen.getByPlaceholderText('Vat Name');
    const bundleUrlInput = screen.getByPlaceholderText('Bundle URL');
    const launchButton = screen.getByRole('button', { name: 'Launch Vat' });

    // Initially disabled
    expect(launchButton).toBeDisabled();

    // Enable with valid inputs
    await userEvent.type(vatNameInput, 'TestVat');
    await userEvent.clear(bundleUrlInput);
    await userEvent.type(bundleUrlInput, 'http://localhost:3000/test.bundle');
    expect(launchButton).toBeEnabled();

    // Disable when vat name is cleared
    await userEvent.clear(vatNameInput);
    expect(launchButton).toBeDisabled();

    // Disable when bundle URL becomes invalid
    vi.mocked(isValidBundleUrl).mockReturnValue(false);
    await userEvent.type(vatNameInput, 'TestVat');
    await userEvent.clear(bundleUrlInput);
    await userEvent.type(bundleUrlInput, 'invalid-url');
    expect(launchButton).toBeDisabled();
  });
});
