import { describe, it, expect } from 'vitest';

import { isTerminalSendError } from './isTerminalSendError.ts';
import { AbortError } from '../errors/AbortError.ts';
import { IntentionalCloseError } from '../errors/IntentionalCloseError.ts';
import { NetworkStoppedError } from '../errors/NetworkStoppedError.ts';
import { PeerRestartedError } from '../errors/PeerRestartedError.ts';

describe('isTerminalSendError', () => {
  describe('returns true for terminal sentinel errors', () => {
    it.each([
      ['PeerRestartedError instance', new PeerRestartedError()],
      ['IntentionalCloseError instance', new IntentionalCloseError()],
      ['NetworkStoppedError instance', new NetworkStoppedError()],
    ])('matches a fresh %s', (_label, error) => {
      expect(isTerminalSendError(error)).toBe(true);
    });

    it.each([
      ['PeerRestartedError', 'PeerRestartedError'],
      ['IntentionalCloseError', 'IntentionalCloseError'],
      ['NetworkStoppedError', 'NetworkStoppedError'],
    ])(
      'matches a plain Error whose name was renamed to %s (RPC-boundary shape)',
      (_label, name) => {
        // Errors that cross the platform-services RPC boundary lose class
        // identity but preserve the `name` field; the predicate must still
        // match in that case.
        const reconstituted = Object.assign(new Error('reconstituted'), {
          name,
        });
        expect(isTerminalSendError(reconstituted)).toBe(true);
      },
    );
  });

  describe('returns false for non-terminal values', () => {
    it.each([
      ['plain Error', new Error('transient network glitch')],
      ['AbortError (not a send-side terminal)', new AbortError()],
      [
        'Error with unrelated name',
        Object.assign(new Error('unrelated'), { name: 'CustomError' }),
      ],
    ])('rejects %s', (_label, error) => {
      expect(isTerminalSendError(error)).toBe(false);
    });

    it.each([
      ['undefined', undefined],
      ['null', null],
      ['string rejection', 'PeerRestartedError'],
      ['plain object with matching name', { name: 'PeerRestartedError' }],
      ['number', 42],
    ])('rejects non-Error %s', (_label, value) => {
      expect(isTerminalSendError(value)).toBe(false);
    });
  });
});
