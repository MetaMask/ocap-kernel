import { describe, expect, it } from 'vitest';

import { renderConceptSketch } from './template.ts';

describe('renderConceptSketch', () => {
  it('replaces every {{token}} marker in the master SVG', () => {
    const rendered = renderConceptSketch({
      providerLabel: 'test-provider',
      revLabel: 'A1',
    });
    expect(rendered).not.toMatch(/\{\{\w+\}\}/u);
  });

  it('substitutes the providerLabel verbatim', () => {
    const rendered = renderConceptSketch({
      providerLabel: 'precision-id',
      revLabel: 'A1',
    });
    expect(rendered).toContain('precision-id');
  });

  it('produces well-formed enough output to start with an <svg> tag', () => {
    const rendered = renderConceptSketch({
      providerLabel: 'test',
      revLabel: 'A1',
    });
    expect(rendered.trimStart()).toMatch(/^<svg\b/u);
    expect(rendered.trimEnd().endsWith('</svg>')).toBe(true);
  });

  it('renders the supplied rev label verbatim', () => {
    const rendered = renderConceptSketch({
      providerLabel: 'test',
      revLabel: 'B7',
    });
    expect(rendered).toMatch(/rev\.\s+B7/u);
  });
});
