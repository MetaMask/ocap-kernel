import { createRoot } from 'react-dom/client';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { App } from './ui/App.tsx';

const mockRender = vi.fn();

vi.mock('react-dom/client', () => ({
  createRoot: vi.fn(() => ({
    render: mockRender,
  })),
}));

vi.mock('./ui/App.tsx', () => ({
  App: vi.fn(() => null),
}));

describe('popup', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    vi.clearAllMocks();
  });

  it('creates root element and mounts App', async () => {
    const root = document.createElement('div');
    root.id = 'root';
    document.body.appendChild(root);
    await import('./popup.tsx');
    expect(createRoot).toHaveBeenCalledWith(root);
    expect(mockRender).toHaveBeenCalledWith(expect.any(Object));
    const renderArgs = mockRender.mock.calls[0];
    expect(renderArgs).toBeDefined();
    expect(renderArgs?.[0]).toBeDefined();
    expect((renderArgs?.[0] as unknown as React.ReactElement)?.type).toBe(App);
  });
});
