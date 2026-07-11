import {
  ChannelResetError,
  IntentionalDisconnectError,
  MessageTooLargeError,
} from '@metamask/kernel-errors';
import { describe, it, expect } from 'vitest';

import { SCTP_USER_INITIATED_ABORT } from './constants.ts';
import {
  isIntentionalDisconnect,
  isRetryableLibp2pError,
  mapLibp2pDialError,
  mapLibp2pReadError,
} from './error-mapper.ts';

const named = (name: string, message = 'boom'): Error =>
  Object.assign(new Error(message), { name });

const coded = (code: string): Error =>
  Object.assign(new Error('network'), { code });

describe('isIntentionalDisconnect', () => {
  it('returns true for an SCTP user-initiated abort', () => {
    expect(
      isIntentionalDisconnect({
        errorDetail: 'sctp-failure',
        sctpCauseCode: SCTP_USER_INITIATED_ABORT,
      }),
    ).toBe(true);
  });

  it.each([
    { name: 'wrong cause code', errorDetail: 'sctp-failure', sctpCauseCode: 1 },
    { name: 'wrong detail', errorDetail: 'other', sctpCauseCode: 12 },
    { name: 'no fields', errorDetail: undefined, sctpCauseCode: undefined },
  ])('returns false for $name', ({ errorDetail, sctpCauseCode }) => {
    expect(isIntentionalDisconnect({ errorDetail, sctpCauseCode })).toBe(false);
  });
});

describe('mapLibp2pReadError', () => {
  it('maps an intentional disconnect to IntentionalDisconnectError', () => {
    const problem = {
      errorDetail: 'sctp-failure',
      sctpCauseCode: SCTP_USER_INITIATED_ABORT,
    };
    const mapped = mapLibp2pReadError(problem);
    expect(mapped).toBeInstanceOf(IntentionalDisconnectError);
  });

  it('passes through an unrecognised error unchanged', () => {
    const problem = named('UnexpectedEOFError');
    expect(mapLibp2pReadError(problem)).toBe(problem);
  });
});

describe('isRetryableLibp2pError', () => {
  it.each([
    { name: 'MuxerClosedError', error: named('MuxerClosedError') },
    { name: 'DialError', error: named('DialError') },
    { name: 'TransportError', error: named('TransportError') },
    { name: 'WebRTCDialError', error: named('WebRTCDialError') },
    {
      name: 'NO_RESERVATION message',
      error: new Error('relay status NO_RESERVATION'),
    },
    { name: 'ChannelResetError', error: new ChannelResetError() },
    { name: 'ECONNRESET code', error: coded('ECONNRESET') },
    { name: 'ENOTFOUND code', error: coded('ENOTFOUND') },
  ])('returns true for $name', ({ error }) => {
    expect(isRetryableLibp2pError(error)).toBe(true);
  });

  it.each([
    { name: 'generic error', error: new Error('nope') },
    { name: 'unknown code', error: coded('EUNKNOWN') },
    { name: 'unknown name', error: named('SomethingElse') },
  ])('returns false for $name', ({ error }) => {
    expect(isRetryableLibp2pError(error)).toBe(false);
  });
});

describe('mapLibp2pDialError', () => {
  it('passes through errors the neutral classifier already handles', () => {
    const reset = new ChannelResetError();
    expect(mapLibp2pDialError(reset)).toBe(reset);
    const node = coded('ECONNREFUSED');
    expect(mapLibp2pDialError(node)).toBe(node);
  });

  it.each([
    { name: 'MuxerClosedError', error: named('MuxerClosedError') },
    { name: 'DialError', error: named('DialError') },
    { name: 'TransportError', error: named('TransportError') },
    {
      name: 'NO_RESERVATION message',
      error: new Error('relay status NO_RESERVATION'),
    },
  ])(
    'wraps the libp2p-specific retryable $name in a ChannelResetError',
    ({ error }) => {
      const mapped = mapLibp2pDialError(error);
      expect(mapped).toBeInstanceOf(ChannelResetError);
      expect((mapped as ChannelResetError).cause).toBe(error);
    },
  );

  it('passes through a non-retryable error unchanged', () => {
    const problem = new Error('fatal');
    expect(mapLibp2pDialError(problem)).toBe(problem);
  });

  it('does not wrap a MessageTooLargeError (non-retryable) into a reset', () => {
    const problem = new MessageTooLargeError();
    expect(mapLibp2pDialError(problem)).toBe(problem);
  });
});
