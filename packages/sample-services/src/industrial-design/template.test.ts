import { describe, expect, it } from 'vitest';

import { renderConceptSketch } from './template.ts';

describe('renderConceptSketch', () => {
  it('replaces every {{token}} marker in the master SVG', () => {
    const rendered = renderConceptSketch({ providerLabel: 'test-provider' });
    expect(rendered).not.toMatch(/\{\{\w+\}\}/u);
  });

  it('substitutes the providerLabel verbatim', () => {
    const rendered = renderConceptSketch({ providerLabel: 'precision-id' });
    expect(rendered).toContain('precision-id');
  });

  it('produces well-formed enough output to start with an <svg> tag', () => {
    const rendered = renderConceptSketch({ providerLabel: 'test' });
    expect(rendered.trimStart()).toMatch(/^<svg\b/u);
    expect(rendered.trimEnd().endsWith('</svg>')).toBe(true);
  });

  it('renders a sensible rev label that matches the documented pattern', () => {
    const rendered = renderConceptSketch({ providerLabel: 'test' });
    expect(rendered).toMatch(/rev\.\s+[A-D][1-3]/u);
  });
});
