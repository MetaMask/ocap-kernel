import { render, screen, cleanup } from '@testing-library/react';
import { describe, it, expect, beforeEach } from 'vitest';

import { App } from './App.tsx';

describe('App', () => {
  beforeEach(() => {
    cleanup();
  });

  it('should render', () => {
    render(<App />);
    expect(screen.getByText('Omnium Gatherum')).toBeInTheDocument();
  });
});
