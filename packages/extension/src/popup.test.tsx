import { createRoot } from 'react-dom/client';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { App } from './ui/App.jsx';

vi.mock('react-dom/client', () => ({
  createRoot: vi.fn(() => ({
    render: vi.fn(),
  })),
}));

vi.mock('./ui/App.jsx', () => ({
  App: vi.fn(() => null),
}));

describe('popup', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('should create root element and mount App', async () => {
    const root = document.createElement('div');
    root.id = 'root';
    document.body.appendChild(root);
    await import('./popup.js');
    expect(createRoot).toHaveBeenCalledWith(root);
    const mockRoot = vi.mocked(createRoot).mock.results[0]?.value;
    expect(mockRoot.render).toHaveBeenCalledWith(expect.any(Object));
    const renderCall = mockRoot.render.mock.calls[0][0];
    expect(renderCall.type).toBe(App);
  });
});
