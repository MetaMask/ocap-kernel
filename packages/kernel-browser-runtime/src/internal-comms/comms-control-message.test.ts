import { describe, it, expect } from 'vitest';

import { isCommsControlMessage } from './comms-control-message.ts';

describe('isCommsControlMessage', () => {
  it('should return true for a valid comms control message', () => {
    const message = {
      method: 'init',
      params: {
        channelName: 'test-channel',
      },
    };
    expect(isCommsControlMessage(message)).toBe(true);
  });

  it('should return false for an invalid comms control message', () => {
    const message = {
      method: 'invalid',
      params: {
        channelName: 'test-channel',
      },
    };
    expect(isCommsControlMessage(message)).toBe(false);
  });
});
