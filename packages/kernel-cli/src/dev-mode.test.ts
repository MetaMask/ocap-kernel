import { describe, it, expect, vi } from 'vitest';

import { resolveDevMode } from './dev-mode.ts';

describe('resolveDevMode', () => {
  it.each([
    { value: undefined, devMode: false, warned: false },
    { value: 'true', devMode: true, warned: false },
    // Everything below must stay off. `1` and `TRUE` are the values someone
    // reaches for by habit, and treating either as truthy would serve
    // arbitrary SQL on a daemon whose operator believed the flag was unset.
    { value: '1', devMode: false, warned: true },
    { value: 'TRUE', devMode: false, warned: true },
    { value: 'True', devMode: false, warned: true },
    { value: 'yes', devMode: false, warned: true },
    { value: 'false', devMode: false, warned: true },
    { value: '', devMode: false, warned: true },
    { value: ' true', devMode: false, warned: true },
    { value: 'true ', devMode: false, warned: true },
  ])('resolves $value to devMode=$devMode', ({ value, devMode, warned }) => {
    const warn = vi.fn();
    const env = (
      value === undefined ? {} : { OCAP_DEV_MODE: value }
    ) as NodeJS.ProcessEnv;

    const result = resolveDevMode({ env, warn });

    expect({ result, warnCount: warn.mock.calls.length }).toStrictEqual({
      result: devMode,
      warnCount: warned ? 1 : 0,
    });
  });

  it('names the offending value in the warning', () => {
    const warn = vi.fn();

    resolveDevMode({ env: { OCAP_DEV_MODE: '1' }, warn });

    expect(warn).toHaveBeenCalledWith(
      "OCAP_DEV_MODE is set to '1', which is not 'true'; dev-only methods stay disabled.",
    );
  });
});
