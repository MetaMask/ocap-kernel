import { describe, expect, it } from 'vitest';

import { renderFirmwareSpec } from './template.ts';

describe('renderFirmwareSpec', () => {
  it('replaces every {{token}} marker in the master markdown', () => {
    const rendered = renderFirmwareSpec();
    expect(rendered).not.toMatch(/\{\{\w+\}\}/u);
  });

  it('starts with the expected heading', () => {
    const rendered = renderFirmwareSpec();
    expect(rendered.trimStart()).toMatch(/^# LSUR firmware specification/u);
  });

  it('inserts a sensible MCU value', () => {
    const rendered = renderFirmwareSpec();
    expect(rendered).toMatch(/ESP32-S3-MINI-N8|RP2040|nRF52840/u);
  });

  it('inserts a debounce in ms', () => {
    const rendered = renderFirmwareSpec();
    expect(rendered).toMatch(/debounce: (10|20|30) ms/u);
  });
});
