import { describe, expect, it } from 'vitest';

import { renderPcbLayout } from './template.ts';

describe('renderPcbLayout', () => {
  it('replaces every {{token}} marker in the master SVG', () => {
    const rendered = renderPcbLayout({ providerLabel: 'test' });
    expect(rendered).not.toMatch(/\{\{\w+\}\}/u);
  });

  it('substitutes a known board color', () => {
    const rendered = renderPcbLayout({ providerLabel: 'test' });
    expect(rendered).toMatch(/#0d6e3a|#1c1c1c|#1c4a8e|#7a0e2e/u);
  });

  it('substitutes a known board size', () => {
    const rendered = renderPcbLayout({ providerLabel: 'test' });
    expect(rendered).toMatch(/46 × 102 mm|52 × 110 mm|58 × 118 mm/u);
  });

  it('substitutes the providerLabel', () => {
    const rendered = renderPcbLayout({
      providerLabel: 'pcb-foundry-compact',
    });
    expect(rendered).toContain('pcb-foundry-compact');
  });
});
