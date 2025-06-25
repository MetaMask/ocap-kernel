import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { LaunchSubcluster } from './LaunchSubcluster.tsx';
import { usePanelContext } from '../context/PanelContext.tsx';
import { useKernelActions } from '../hooks/useKernelActions.ts';

vi.mock('../hooks/useKernelActions.ts', () => ({
  useKernelActions: vi.fn(),
}));

vi.mock('../context/PanelContext.tsx', () => ({
  usePanelContext: vi.fn(),
}));

vi.mock('../App.module.css', () => ({
  default: {
    newVatWrapper: 'new-vat-wrapper',
    noMargin: 'no-margin',
    dropZone: 'drop-zone',
    dragging: 'dragging',
    dropZoneContent: 'drop-zone-content',
    uploadIcon: 'upload-icon',
    dropZoneText: 'drop-zone-text',
    buttonPrimary: 'button-primary',
  },
}));

/**
 * Creates a mock DataTransfer object for testing drag and drop functionality.
 *
 * @param files - Array of files to include in the mock DataTransfer
 * @returns A mock DataTransfer object
 */
const createMockDataTransfer = (files: File[]) => {
  return {
    files: {
      length: files.length,
      item: (_index: number) => files[_index] ?? null,
      *[Symbol.iterator]() {
        for (const file of files) {
          yield file;
        }
      },
    },
    setData: vi.fn(),
    getData: vi.fn(),
  };
};

describe('LaunchSubcluster', () => {
  const mockLaunchSubcluster = vi.fn();
  const mockLogMessage = vi.fn();

  beforeEach(() => {
    cleanup();
    (useKernelActions as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      launchSubcluster: mockLaunchSubcluster,
    });
    (usePanelContext as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      logMessage: mockLogMessage,
    });
  });

  it('renders the component with initial state', () => {
    render(<LaunchSubcluster />);
    expect(screen.getByText('Launch New Subcluster')).toBeInTheDocument();
    expect(
      screen.getByText('Drag and drop your cluster config JSON file here'),
    ).toBeInTheDocument();
    expect(screen.getByText('Browse Files')).toBeInTheDocument();
  });

  it('handles file selection through input', async () => {
    render(<LaunchSubcluster />);
    const file = new File(['{"test": "config"}'], 'config.json', {
      type: 'application/json',
    });
    const input = screen.getByLabelText('Browse Files');
    fireEvent.change(input, { target: { files: [file] } });
    await waitFor(() => {
      expect(mockLaunchSubcluster).toHaveBeenCalledWith({ test: 'config' });
    });
  });

  it('handles drag and drop of valid JSON file', async () => {
    render(<LaunchSubcluster />);
    const dropZone = screen.getByText(
      'Drag and drop your cluster config JSON file here',
    ).parentElement?.parentElement;
    expect(dropZone).toBeDefined();
    const dropZoneElement = dropZone as HTMLElement;
    const file = new File(['{"test": "config"}'], 'config.json', {
      type: 'application/json',
    });
    const dataTransfer = createMockDataTransfer([file]);
    fireEvent.dragOver(dropZoneElement, { dataTransfer });
    fireEvent.drop(dropZoneElement, { dataTransfer });
    const input = screen.getByLabelText('Browse Files');
    fireEvent.change(input, { target: { files: [file] } });
    await waitFor(() => {
      expect(mockLaunchSubcluster).toHaveBeenCalledWith({ test: 'config' });
    });
  });

  it('shows error message for invalid file type', async () => {
    render(<LaunchSubcluster />);

    const dropZone = screen.getByText(
      'Drag and drop your cluster config JSON file here',
    ).parentElement?.parentElement;
    expect(dropZone).toBeDefined();
    const dropZoneElement = dropZone as HTMLElement;
    const file = new File(['invalid content'], 'config.txt', {
      type: 'text/plain',
    });
    const dataTransfer = createMockDataTransfer([file]);
    fireEvent.drop(dropZoneElement, { dataTransfer });
    const input = screen.getByLabelText('Browse Files');
    fireEvent.change(input, { target: { files: [file] } });
    expect(mockLogMessage).toHaveBeenCalledWith(
      'Please drop a valid JSON file.',
      'error',
    );
  });

  it('shows error message for invalid JSON content', async () => {
    render(<LaunchSubcluster />);
    const file = new File(['invalid json'], 'config.json', {
      type: 'application/json',
    });
    const input = screen.getByLabelText('Browse Files');
    fireEvent.change(input, { target: { files: [file] } });
    await waitFor(() => {
      expect(mockLogMessage).toHaveBeenCalledWith(
        expect.stringContaining('Error parsing cluster configuration'),
        'error',
      );
    });
  });

  it('updates file name display after file selection', async () => {
    render(<LaunchSubcluster />);
    const file = new File(['{"test": "config"}'], 'test-config.json', {
      type: 'application/json',
    });
    const input = screen.getByLabelText('Browse Files');
    fireEvent.change(input, { target: { files: [file] } });
    await waitFor(() => {
      expect(screen.getByText('test-config.json')).toBeInTheDocument();
    });
  });

  it('handles file read error', async () => {
    render(<LaunchSubcluster />);
    const file = new File(['{"test": "config"}'], 'config.json', {
      type: 'application/json',
    });
    const input = screen.getByLabelText('Browse Files');
    const mockFileReader = {
      readAsText: vi.fn(),
      onerror: vi.fn(),
    };
    vi.spyOn(window, 'FileReader').mockImplementation(
      () => mockFileReader as unknown as FileReader,
    );
    fireEvent.change(input, { target: { files: [file] } });
    mockFileReader.onerror();
    expect(mockLogMessage).toHaveBeenCalledWith(
      'Failed to read file.',
      'error',
    );
  });

  it('handles non-string file content', async () => {
    render(<LaunchSubcluster />);
    const file = new File(['{"test": "config"}'], 'config.json', {
      type: 'application/json',
    });
    const input = screen.getByLabelText('Browse Files');
    const mockFileReader = {
      readAsText: vi.fn(),
      onload: vi.fn(),
    };
    vi.spyOn(window, 'FileReader').mockImplementation(
      () => mockFileReader as unknown as FileReader,
    );
    fireEvent.change(input, { target: { files: [file] } });
    mockFileReader.onload({
      target: { result: null },
    } as ProgressEvent<FileReader>);
    expect(mockLogMessage).toHaveBeenCalledWith(
      'Failed to read file content.',
      'error',
    );
  });

  it('handles undefined file in file input change', () => {
    render(<LaunchSubcluster />);
    const input = screen.getByLabelText('Browse Files');
    fireEvent.change(input, { target: { files: [] } });
    expect(
      screen.getByText('Drag and drop your cluster config JSON file here'),
    ).toBeInTheDocument();
  });

  it('handles drag over event', () => {
    render(<LaunchSubcluster />);
    const dropZone = screen.getByText(
      'Drag and drop your cluster config JSON file here',
    ).parentElement?.parentElement as HTMLElement;
    fireEvent.dragOver(dropZone);
    expect(dropZone).toHaveClass('dragging');
  });

  it('handles drag leave event', () => {
    render(<LaunchSubcluster />);
    const dropZone = screen.getByText(
      'Drag and drop your cluster config JSON file here',
    ).parentElement?.parentElement as HTMLElement;
    fireEvent.dragOver(dropZone);
    expect(dropZone).toHaveClass('dragging');
    fireEvent.dragLeave(dropZone);
    expect(dropZone).not.toHaveClass('dragging');
  });

  it('handles drop when input element is not found', () => {
    render(<LaunchSubcluster />);
    const dropZone = screen.getByText(
      'Drag and drop your cluster config JSON file here',
    ).parentElement?.parentElement as HTMLElement;
    const file = new File(['{"test": "config"}'], 'config.json', {
      type: 'application/json',
    });
    const dataTransfer = createMockDataTransfer([file]);
    const input = screen.getByLabelText('Browse Files');
    input.remove();
    fireEvent.drop(dropZone, { dataTransfer });
    expect(mockLogMessage).toHaveBeenCalledWith(
      'Please drop a valid JSON file.',
      'error',
    );
  });
});
