import { describe, expect, it } from 'vitest';

import { renderSchematic } from './template.ts';

describe('renderSchematic', () => {
  it('replaces every {{token}} marker in the master SVG', () => {
    const rendered = renderSchematic({ providerLabel: 'test-provider' });
    expect(rendered).not.toMatch(/\{\{\w+\}\}/u);
  });

  it('substitutes the providerLabel verbatim', () => {
    const rendered = renderSchematic({ providerLabel: 'rapid-ee' });
    expect(rendered).toContain('rapid-ee');
  });

  it('produces well-formed-enough output to start with an <svg> tag', () => {
    const rendered = renderSchematic({ providerLabel: 'test' });
    expect(rendered.trimStart()).toMatch(/^<svg\b/u);
    expect(rendered.trimEnd().endsWith('</svg>')).toBe(true);
  });

  it('renders a date in YYYY-MM-DD form', () => {
    const rendered = renderSchematic({ providerLabel: 'test' });
    expect(rendered).toMatch(/\d{4}-\d{2}-\d{2}/u);
  });

  it('renders a sensible rev label', () => {
    const rendered = renderSchematic({ providerLabel: 'test' });
    expect(rendered).toMatch(/Rev\s+[A-D][1-4]/u);
  });
});
