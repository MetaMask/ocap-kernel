import { render } from 'react-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { App } from './ui/App.tsx';

vi.mock('react-dom', () => ({
  render: vi.fn(),
}));

vi.mock('./ui/App.tsx', () => ({
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
    await import('./popup.tsx');
    expect(render).toHaveBeenCalledWith(expect.any(Object), root);
    const renderArgs = vi.mocked(render).mock.calls[0];
    expect(renderArgs).toBeDefined();
    expect(renderArgs?.[0]).toBeDefined();
    expect((renderArgs?.[0] as unknown as React.ReactElement)?.type).toBe(App);
  });
});
