import { describe, expect, it } from 'vitest';

import { renderMechanicalHero } from './template.ts';

describe('renderMechanicalHero', () => {
  it('replaces every {{token}} marker in the master SVG', () => {
    const rendered = renderMechanicalHero({ providerLabel: 'test' });
    expect(rendered).not.toMatch(/\{\{\w+\}\}/u);
  });

  it('substitutes a known colorway name', () => {
    const rendered = renderMechanicalHero({ providerLabel: 'test' });
    expect(rendered).toMatch(/matte black|soft white|smoke grey/u);
  });

  it('substitutes the providerLabel', () => {
    const rendered = renderMechanicalHero({ providerLabel: 'nantucket-mech' });
    expect(rendered).toContain('nantucket-mech');
  });

  it('starts with an <svg> tag and ends with </svg>', () => {
    const rendered = renderMechanicalHero({ providerLabel: 'test' });
    expect(rendered.trimStart()).toMatch(/^<svg\b/u);
    expect(rendered.trimEnd().endsWith('</svg>')).toBe(true);
  });
});
