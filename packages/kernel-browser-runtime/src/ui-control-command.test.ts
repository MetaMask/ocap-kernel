import { describe, it, expect } from 'vitest';

import { isUiControlCommand } from './ui-control-command.ts';

describe('isUiControlCommand', () => {
  it('should return true for a valid ui control command', () => {
    const command = {
      method: 'init',
      params: 'test-channel',
    };
    expect(isUiControlCommand(command)).toBe(true);
  });

  it('should return false for an invalid ui control command', () => {
    const command = {
      method: 'invalid',
      params: 'test-channel',
    };
    expect(isUiControlCommand(command)).toBe(false);
  });
});
