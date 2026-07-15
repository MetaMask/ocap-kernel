import { describe, expect, it } from 'vitest';

import {
  renderFirmwareImplementation,
  renderFirmwareSpec,
} from './template.ts';

describe('renderFirmwareSpec', () => {
  it('replaces every {{token}} marker in the master markdown', () => {
    const rendered = renderFirmwareSpec();
    expect(rendered).not.toMatch(/\{\{\w+\}\}/u);
  });

  it('starts with the expected heading', () => {
    const rendered = renderFirmwareSpec();
    expect(rendered.trimStart()).toMatch(/^# LAUR firmware specification/u);
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

describe('renderFirmwareImplementation', () => {
  it('replaces every {{token}} marker in the master C source', () => {
    const rendered = renderFirmwareImplementation();
    expect(rendered).not.toMatch(/\{\{\w+\}\}/u);
  });

  it('includes the LAUR firmware comment header', () => {
    const rendered = renderFirmwareImplementation();
    expect(rendered).toMatch(/LAUR firmware — keypad FSM/u);
  });

  it('inserts the ESP32-S3 IR GPIO macro and the MCU name', () => {
    const rendered = renderFirmwareImplementation();
    expect(rendered).toContain('ESP32-S3-MINI-N8');
    expect(rendered).toContain('GPIO_NUM_4');
  });

  it('does not emit a "changes incorporated" block when no changes are passed', () => {
    const rendered = renderFirmwareImplementation();
    expect(rendered).not.toMatch(/Inventor-requested changes incorporated/u);
  });

  it('folds inventor-supplied changes into the header comment', () => {
    const changes =
      'Bump idle timeout to 300s.\nAdd BLE HID profile placeholder.';
    const rendered = renderFirmwareImplementation({ changes });
    expect(rendered).toMatch(/Inventor-requested changes incorporated:/u);
    expect(rendered).toContain('Bump idle timeout to 300s.');
    expect(rendered).toContain('Add BLE HID profile placeholder.');
  });

  it('steps the rev label forward from the supplied spec rev', () => {
    const rendered = renderFirmwareImplementation({}, 'F2');
    expect(rendered).toMatch(/Rev\s+:\s+F3/u);
  });
});
