import type { KernelStatus } from '@metamask/ocap-kernel';
import { render, screen, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { RunLoopBanner } from './RunLoopBanner.tsx';
import { usePanelContext } from '../context/PanelContext.tsx';
import type { PanelContextType } from '../context/PanelContext.tsx';

vi.mock('../context/PanelContext.tsx', () => ({
  usePanelContext: vi.fn(),
}));

const mockUsePanelContext = vi.mocked(usePanelContext);

const makeMockPanelContext = (
  status: KernelStatus | undefined,
): PanelContextType => ({
  status,
  callKernelMethod: vi.fn(),
  logMessage: vi.fn(),
  messageContent: '',
  setMessageContent: vi.fn(),
  panelLogs: [],
  clearLogs: vi.fn(),
  isLoading: false,
  objectRegistry: null,
  setObjectRegistry: vi.fn(),
});

const makeMockStatus = (runLoop: KernelStatus['runLoop']): KernelStatus => ({
  vats: [],
  subclusters: [],
  runLoop,
});

describe('RunLoopBanner', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('announces a dead run loop with the reason it died', () => {
    mockUsePanelContext.mockReturnValue(
      makeMockPanelContext(
        makeMockStatus({ state: 'failed', error: 'crank exploded' }),
      ),
    );

    render(<RunLoopBanner />);

    expect(screen.getByTestId('run-loop-failure')).toHaveTextContent(
      'Kernel run loop has died',
    );
    expect(screen.getByTestId('run-loop-failure-error')).toHaveTextContent(
      'crank exploded',
    );
  });

  it.each([
    { name: 'running', runLoop: { state: 'running' } as const },
    { name: 'idle', runLoop: { state: 'idle' } as const },
  ])('renders nothing when the run loop is $name', ({ runLoop }) => {
    mockUsePanelContext.mockReturnValue(
      makeMockPanelContext(makeMockStatus(runLoop)),
    );

    render(<RunLoopBanner />);

    expect(screen.queryByTestId('run-loop-failure')).toBeNull();
  });

  it('renders nothing before the first status arrives', () => {
    mockUsePanelContext.mockReturnValue(makeMockPanelContext(undefined));

    render(<RunLoopBanner />);

    expect(screen.queryByTestId('run-loop-failure')).toBeNull();
  });
});
