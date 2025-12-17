import type { VatOneResolution } from '@agoric/swingset-liveslots';
import type { Logger } from '@metamask/logger';
import { makeAbortSignalMock } from '@ocap/repo-tools/test-utils';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import type { KernelQueue } from '../KernelQueue.ts';
import { RemoteHandle } from './RemoteHandle.ts';
import { createMockRemotesFactory } from '../../test/remotes-mocks.ts';
import type { KernelStore } from '../store/index.ts';
import { parseRef } from '../store/utils/parse-ref.ts';
import type { Message, RRef } from '../types.ts';
import type { RemoteComms } from './types.ts';

let mockKernelStore: KernelStore;
let mockRemoteComms: RemoteComms;
let mockKernelQueue: KernelQueue;
const mockRemoteId = 'r0';
const mockRemotePeerId = 'remotePeerId';
let mockFactory: ReturnType<typeof createMockRemotesFactory>;

/* eslint-disable vitest/no-conditional-expect */

/**
 * Fabricate a mock remote for testing purposes
 *
 * @param logger - A logger, if you care.
 *
 * @returns a new RemoteHandle suitable for use in testing.
 */
export function makeRemote(logger?: Logger): RemoteHandle {
  return RemoteHandle.make({
    remoteId: mockRemoteId,
    peerId: mockRemotePeerId,
    kernelStore: mockKernelStore,
    kernelQueue: mockKernelQueue,
    remoteComms: mockRemoteComms,
    logger,
  });
}

describe('RemoteHandle', () => {
  beforeEach(() => {
    mockFactory = createMockRemotesFactory({
      remoteId: mockRemoteId,
      remotePeerId: mockRemotePeerId,
    });

    const mocks = mockFactory.makeRemoteHandleMocks();
    mockKernelStore = mocks.kernelStore;
    mockKernelQueue = mocks.kernelQueue;
    mockRemoteComms = mocks.remoteComms;

    // Override specific mock behaviors for this test
    const mockRedeemLocalOcapURL = vi.fn();
    mockRedeemLocalOcapURL.mockReturnValue('ko100');
    mockRemoteComms.redeemLocalOcapURL = mockRedeemLocalOcapURL;
    mockRemoteComms.getPeerId = () => 'myPeerId';
  });

  it('deliverMessage calls sendRemoteMessage with correct delivery message', async () => {
    const remote = makeRemote();
    const target: RRef = 'ro+1';
    const message: Message = {
      methargs: { body: '["method",["arg1","arg2"]]', slots: [] },
      result: 'rp-2',
    };
    const crankResult = await remote.deliverMessage(target, message);
    expect(mockRemoteComms.sendRemoteMessage).toHaveBeenCalledWith(
      mockRemotePeerId,
      JSON.stringify({
        method: 'deliver',
        params: ['message', target, message],
      }),
    );
    expect(crankResult).toStrictEqual({ didDelivery: remote.remoteId });
  });

  it('deliverNotify calls sendRemoteMessage with correct delivery message', async () => {
    const remote = makeRemote();
    const resolutions: VatOneResolution[] = [
      ['rp-3', false, { body: '"resolved value"', slots: [] }],
    ];

    const crankResult = await remote.deliverNotify(resolutions);
    expect(mockRemoteComms.sendRemoteMessage).toHaveBeenCalledWith(
      mockRemotePeerId,
      JSON.stringify({
        method: 'deliver',
        params: ['notify', resolutions],
      }),
    );
    expect(crankResult).toStrictEqual({ didDelivery: remote.remoteId });
  });

  it('deliverDropExports calls sendRemoteMessage with correct delivery message', async () => {
    const remote = makeRemote();
    const rrefs: RRef[] = ['ro+4', 'ro+5'];

    const crankResult = await remote.deliverDropExports(rrefs);
    expect(mockRemoteComms.sendRemoteMessage).toHaveBeenCalledWith(
      mockRemotePeerId,
      JSON.stringify({
        method: 'deliver',
        params: ['dropExports', rrefs],
      }),
    );
    expect(crankResult).toStrictEqual({ didDelivery: remote.remoteId });
  });

  it('deliverRetireExports calls sendRemoteMessage with correct delivery message', async () => {
    const remote = makeRemote();
    const rrefs: RRef[] = ['ro+4', 'ro+5'];

    const crankResult = await remote.deliverRetireExports(rrefs);
    expect(mockRemoteComms.sendRemoteMessage).toHaveBeenCalledWith(
      mockRemotePeerId,
      JSON.stringify({
        method: 'deliver',
        params: ['retireExports', rrefs],
      }),
    );
    expect(crankResult).toStrictEqual({ didDelivery: remote.remoteId });
  });

  it('deliverRetireImports calls sendRemoteMessage with correct delivery message', async () => {
    const remote = makeRemote();
    const rrefs: RRef[] = ['ro+4', 'ro+5'];

    const crankResult = await remote.deliverRetireImports(rrefs);
    expect(mockRemoteComms.sendRemoteMessage).toHaveBeenCalledWith(
      mockRemotePeerId,
      JSON.stringify({
        method: 'deliver',
        params: ['retireImports', rrefs],
      }),
    );
    expect(crankResult).toStrictEqual({ didDelivery: remote.remoteId });
  });

  it('deliverBringOutYourDead does not call sendRemoteMessage', async () => {
    const remote = makeRemote();

    const crankResult = await remote.deliverBringOutYourDead();
    expect(mockRemoteComms.sendRemoteMessage).not.toHaveBeenCalled();
    expect(crankResult).toStrictEqual({ didDelivery: remote.remoteId });
  });

  it('redeemOcapURL calls sendRemoteMessage correctly and handles expected reply (success)', async () => {
    const remote = makeRemote();
    const mockOcapURL = 'as if it was a URL';
    const mockURLResolutionRRef = 'ro+6';
    const mockURLResolutionKRef = 'ko1';
    const expectedReplyKey = '1';

    const urlPromise = remote.redeemOcapURL(mockOcapURL);
    const redeemURLReply = {
      method: 'redeemURLReply',
      params: [true, expectedReplyKey, mockURLResolutionRRef],
    };
    await remote.handleRemoteMessage(JSON.stringify(redeemURLReply));
    const kref = await urlPromise;
    expect(mockRemoteComms.registerLocationHints).toHaveBeenCalledWith(
      mockRemotePeerId,
      [],
    );
    expect(mockRemoteComms.sendRemoteMessage).toHaveBeenCalledWith(
      mockRemotePeerId,
      JSON.stringify({
        method: 'redeemURL',
        params: [mockOcapURL, expectedReplyKey],
      }),
    );
    expect(kref).toBe(mockURLResolutionKRef);
    expect(
      mockKernelStore.translateRefEtoK(remote.remoteId, mockURLResolutionRRef),
    ).toBe(mockURLResolutionKRef);
  });

  it('redeemOcapURL calls sendRemoteMessage correctly and handles expected reply (failure)', async () => {
    const remote = makeRemote();
    const mockOcapURL = 'as if it was a URL';
    const expectedReplyKey = '1';

    const urlPromise = remote.redeemOcapURL(mockOcapURL);
    const redeemURLReply = {
      method: 'redeemURLReply',
      params: [false, expectedReplyKey],
    };
    await remote.handleRemoteMessage(JSON.stringify(redeemURLReply));
    expect(mockRemoteComms.registerLocationHints).toHaveBeenCalledWith(
      mockRemotePeerId,
      [],
    );
    expect(mockRemoteComms.sendRemoteMessage).toHaveBeenCalledWith(
      mockRemotePeerId,
      JSON.stringify({
        method: 'redeemURL',
        params: [mockOcapURL, expectedReplyKey],
      }),
    );
    await expect(urlPromise).rejects.toThrow(
      `vitest ignores this string but lint complains if it's not here`,
    );
  });

  it('handleRemoteMessage throws for unknown URL redemption reply key', async () => {
    const remote = makeRemote();
    const unknownReplyKey = 'unknown-key';

    const redeemURLReply = {
      method: 'redeemURLReply',
      params: [true, unknownReplyKey, 'ro+1'],
    };

    await expect(
      remote.handleRemoteMessage(JSON.stringify(redeemURLReply)),
    ).rejects.toThrow(`unknown URL redemption reply key ${unknownReplyKey}`);
  });

  it('handleRemoteMessage handles deliver message', async () => {
    const remote = makeRemote();
    const targetRRef = 'ro+1';
    const targetKRef = 'ko1';
    const resultRRef = 'rp+2';
    const resultKRef = 'kp1';
    const message: Message = {
      methargs: { body: '["method",["arg1","arg2"]]', slots: [] },
      result: resultRRef,
    };
    const delivery = JSON.stringify({
      method: 'deliver',
      params: ['message', targetRRef, message],
    });
    const reply = await remote.handleRemoteMessage(delivery);
    expect(reply).toBe('');
    expect(mockKernelQueue.enqueueSend).toHaveBeenCalledWith(targetKRef, {
      methargs: message.methargs,
      result: resultKRef,
    });
    expect(mockKernelStore.translateRefEtoK(remote.remoteId, targetRRef)).toBe(
      targetKRef,
    );
    expect(mockKernelStore.translateRefEtoK(remote.remoteId, resultRRef)).toBe(
      resultKRef,
    );
  });

  it('handleRemoteMessage handles deliver notify', async () => {
    const remote = makeRemote();
    const promiseRRef = 'rp+3';
    const promiseKRef = 'kp1';
    const resolutions: VatOneResolution[] = [
      [promiseRRef, false, { body: '"resolved value"', slots: [] }],
    ];
    const notify = JSON.stringify({
      method: 'deliver',
      params: ['notify', resolutions],
    });
    const reply = await remote.handleRemoteMessage(notify);
    expect(reply).toBe('');
    expect(mockKernelQueue.resolvePromises).toHaveBeenCalledWith(
      remote.remoteId,
      [[promiseKRef, false, { body: '"resolved value"', slots: [] }]],
    );
  });

  it('handleRemoteMessage handles deliver dropExports', async () => {
    const remote = makeRemote();

    // Note that vat v1 does not exist; we're just pretending the test object
    // came from there (because it had to come from *somewhere*).
    const koref = mockKernelStore.initKernelObject('v1');
    const [kpref] = mockKernelStore.initKernelPromise();
    mockKernelStore.kv.set(`e.nextObjectId.${remote.remoteId}`, `1`);
    mockKernelStore.kv.set(`e.nextPromiseId.${remote.remoteId}`, `1`);

    // Pretend these refs had earlier been imported into the test remote from
    // our kernel (as if they had, say, appeared in message slots) and thence were
    // exported at the remote end.  This way they'll be here to be dropped when
    // a request to do so is "received".
    const roref = mockKernelStore.translateRefKtoE(
      remote.remoteId,
      koref,
      true,
    );
    const rpref = mockKernelStore.translateRefKtoE(
      remote.remoteId,
      kpref,
      true,
    );

    const drops = [
      mockKernelStore.invertRRef(roref),
      mockKernelStore.invertRRef(rpref),
    ];

    const krefs = drops.map((rref) => {
      const result = mockKernelStore.translateRefEtoK(remote.remoteId, rref);
      return result;
    });
    for (const kref of krefs) {
      const { isPromise } = parseRef(kref);
      if (isPromise) {
        expect(mockKernelStore.getRefCount(kref)).toBe(1);
      } else {
        expect(mockKernelStore.getObjectRefCount(kref)).toStrictEqual({
          reachable: 1,
          recognizable: 1,
        });
      }
    }

    // Now have the "other end" drop them.
    const dropExports = JSON.stringify({
      method: 'deliver',
      params: ['dropExports', drops],
    });
    const reply = await remote.handleRemoteMessage(dropExports);

    expect(reply).toBe('');
    for (const kref of krefs) {
      const { isPromise } = parseRef(kref);
      if (isPromise) {
        expect(mockKernelStore.getRefCount(kref)).toBe(1);
      } else {
        expect(mockKernelStore.getObjectRefCount(kref)).toStrictEqual({
          reachable: 0,
          recognizable: 1,
        });
      }
    }
  });

  it('handleRemoteMessage handles deliver retireExports', async () => {
    const remote = makeRemote();

    // Note that vat v1 does not exist; we're just pretending the test object
    // came from there (because it had to come from *somewhere*).
    const koref = mockKernelStore.initKernelObject('v1');
    mockKernelStore.kv.set(`e.nextObjectId.${remote.remoteId}`, `1`);

    // Pretend this ref had earlier been imported into the test remote from our
    // kernel (as if it had, say, appeared in message slots) and thence wwas
    // exported at the remote end.  This way it'll be here to be retired when a
    // request to do so is "received".
    const roref = mockKernelStore.translateRefKtoE(
      remote.remoteId,
      koref,
      true,
    );

    const toRetireRRef = mockKernelStore.invertRRef(roref);

    const kref = mockKernelStore.translateRefEtoK(
      remote.remoteId,
      toRetireRRef,
    );
    expect(mockKernelStore.getObjectRefCount(kref)).toStrictEqual({
      reachable: 1,
      recognizable: 1,
    });

    // Before we can retire, we have to drop, so pretend that happened too
    mockKernelStore.clearReachableFlag(remote.remoteId, kref);

    // Now have the "other end" retire them.
    const retireExports = JSON.stringify({
      method: 'deliver',
      params: ['retireExports', [toRetireRRef]],
    });
    const reply = await remote.handleRemoteMessage(retireExports);

    expect(reply).toBe('');
    expect(mockKernelStore.getObjectRefCount(kref)).toStrictEqual({
      reachable: 0,
      recognizable: 0,
    });
  });

  it('handleRemoteMessage handles deliver retireImports', async () => {
    const remote = makeRemote();

    // An object, as if it had been imported from the other end (and thus exported here)
    const roref = 'ro+1';
    const koref = mockKernelStore.translateRefEtoK(remote.remoteId, roref);

    // As if we're no longer using it (which, in fact, we weren't), which is a
    // prequisite for a valid 'retireImports' delivery
    mockKernelStore.decrementRefCount(koref, 'test');
    mockKernelStore.clearReachableFlag(remote.remoteId, koref);

    // Now have the "other end" retire the import.
    const retireImports = JSON.stringify({
      method: 'deliver',
      params: ['retireImports', [roref]],
    });
    const reply = await remote.handleRemoteMessage(retireImports);

    expect(reply).toBe('');

    // Object should have disappeared from the clists
    expect(() =>
      mockKernelStore.translateRefKtoE(remote.remoteId, koref, false),
    ).toThrow(`unmapped kref "${koref}" endpoint="${remote.remoteId}"`);
    expect(mockKernelStore.erefToKref(remote.remoteId, roref)).toBeUndefined();
  });

  it('handleRemoteMessage handles bogus deliver', async () => {
    const remote = makeRemote();
    const delivery = JSON.stringify({
      method: 'deliver',
      params: ['bogus'],
    });
    await expect(remote.handleRemoteMessage(delivery)).rejects.toThrow(
      'unknown remote delivery method bogus',
    );
  });

  it('handleRemoteMessage handles redeemURL request', async () => {
    const remote = makeRemote();
    const mockOcapURL = 'as if it was a URL';
    const mockReplyKey = 'replyKey';
    const replyKRef = 'ko100';
    const replyRRef = 'ro+1';
    const request = JSON.stringify({
      method: 'redeemURL',
      params: [mockOcapURL, mockReplyKey],
    });
    mockKernelStore.kv.set(`e.nextObjectId.r0`, `1`); // mock effects of stuff that was never called
    const reply = await remote.handleRemoteMessage(request);
    expect(mockRemoteComms.redeemLocalOcapURL).toHaveBeenCalledWith(
      mockOcapURL,
    );
    expect(reply).toBe(
      JSON.stringify({
        method: 'redeemURLReply',
        params: [true, mockReplyKey, replyRRef],
      }),
    );
    expect(
      mockKernelStore.translateRefKtoE(remote.remoteId, replyKRef, false),
    ).toBe(replyRRef);
  });

  it('handleRemoteMessage handles redeemURL request with error', async () => {
    const remote = makeRemote();
    const mockOcapURL = 'invalid-url';
    const mockReplyKey = 'replyKey';
    const errorMessage = 'Invalid URL format';

    // Mock redeemLocalOcapURL to throw an error
    vi.spyOn(mockRemoteComms, 'redeemLocalOcapURL').mockRejectedValue(
      new Error(errorMessage),
    );

    const request = JSON.stringify({
      method: 'redeemURL',
      params: [mockOcapURL, mockReplyKey],
    });

    const reply = await remote.handleRemoteMessage(request);

    expect(mockRemoteComms.redeemLocalOcapURL).toHaveBeenCalledWith(
      mockOcapURL,
    );
    expect(reply).toBe(
      JSON.stringify({
        method: 'redeemURLReply',
        params: [false, mockReplyKey, errorMessage],
      }),
    );
  });

  it('handleRemoteMessage rejects bogus message type', async () => {
    const remote = makeRemote();
    const request = JSON.stringify({
      method: 'bogus',
      params: [],
    });
    await expect(remote.handleRemoteMessage(request)).rejects.toThrow(
      'unknown remote message type bogus',
    );
  });

  it('rejectPendingRedemptions rejects all pending redemptions', async () => {
    const remote = makeRemote();
    const errorMessage = 'Connection lost';

    // Start multiple URL redemptions
    const promise1 = remote.redeemOcapURL('url1');
    const promise2 = remote.redeemOcapURL('url2');
    const promise3 = remote.redeemOcapURL('url3');

    // Reject all pending redemptions
    remote.rejectPendingRedemptions(errorMessage);

    // All promises should be rejected with the error
    await expect(promise1).rejects.toThrow(errorMessage);
    await expect(promise2).rejects.toThrow(errorMessage);
    await expect(promise3).rejects.toThrow(errorMessage);
  });

  it('rejectPendingRedemptions clears pending redemptions map', async () => {
    const remote = makeRemote();
    const errorMessage = 'Connection lost';

    // Start a URL redemption
    const promise = remote.redeemOcapURL('url1');

    // Reject all pending redemptions
    remote.rejectPendingRedemptions(errorMessage);

    // Try to handle a reply for the rejected redemption - should fail
    const redeemURLReply = {
      method: 'redeemURLReply',
      params: [true, '1', 'ro+1'],
    };
    await expect(
      remote.handleRemoteMessage(JSON.stringify(redeemURLReply)),
    ).rejects.toThrow('unknown URL redemption reply key 1');

    await expect(promise).rejects.toThrow(errorMessage);
  });

  it('rejectPendingRedemptions handles empty pending redemptions', () => {
    const remote = makeRemote();
    const errorMessage = 'Connection lost';

    // Should not throw when there are no pending redemptions
    expect(() => remote.rejectPendingRedemptions(errorMessage)).not.toThrow();
  });

  it('redeemOcapURL increments redemption counter for multiple redemptions', async () => {
    const remote = makeRemote();
    const mockOcapURL1 = 'url1';
    const mockOcapURL2 = 'url2';
    const mockOcapURL3 = 'url3';

    // Start multiple redemptions
    const promise1 = remote.redeemOcapURL(mockOcapURL1);
    const promise2 = remote.redeemOcapURL(mockOcapURL2);
    const promise3 = remote.redeemOcapURL(mockOcapURL3);

    // Resolve all redemptions
    await remote.handleRemoteMessage(
      JSON.stringify({
        method: 'redeemURLReply',
        params: [true, '1', 'ro+1'],
      }),
    );
    await remote.handleRemoteMessage(
      JSON.stringify({
        method: 'redeemURLReply',
        params: [true, '2', 'ro+2'],
      }),
    );
    await remote.handleRemoteMessage(
      JSON.stringify({
        method: 'redeemURLReply',
        params: [true, '3', 'ro+3'],
      }),
    );

    await promise1;
    await promise2;
    await promise3;

    // Verify each redemption uses a different reply key
    expect(mockRemoteComms.sendRemoteMessage).toHaveBeenCalledWith(
      mockRemotePeerId,
      JSON.stringify({
        method: 'redeemURL',
        params: [mockOcapURL1, '1'],
      }),
    );
    expect(mockRemoteComms.sendRemoteMessage).toHaveBeenCalledWith(
      mockRemotePeerId,
      JSON.stringify({
        method: 'redeemURL',
        params: [mockOcapURL2, '2'],
      }),
    );
    expect(mockRemoteComms.sendRemoteMessage).toHaveBeenCalledWith(
      mockRemotePeerId,
      JSON.stringify({
        method: 'redeemURL',
        params: [mockOcapURL3, '3'],
      }),
    );
  });

  it('handles multiple concurrent URL redemptions independently', async () => {
    const remote = makeRemote();
    const mockOcapURL1 = 'url1';
    const mockOcapURL2 = 'url2';
    const mockURLResolutionRRef1 = 'ro+1';
    const mockURLResolutionRRef2 = 'ro+2';

    // Start two concurrent redemptions
    const promise1 = remote.redeemOcapURL(mockOcapURL1);
    const promise2 = remote.redeemOcapURL(mockOcapURL2);

    // Resolve them in reverse order to verify they're handled independently
    await remote.handleRemoteMessage(
      JSON.stringify({
        method: 'redeemURLReply',
        params: [true, '2', mockURLResolutionRRef2],
      }),
    );
    await remote.handleRemoteMessage(
      JSON.stringify({
        method: 'redeemURLReply',
        params: [true, '1', mockURLResolutionRRef1],
      }),
    );

    const kref1 = await promise1;
    const kref2 = await promise2;

    // Verify each promise resolved with the correct value based on its reply key
    expect(kref1).toBe(
      mockKernelStore.translateRefEtoK(remote.remoteId, mockURLResolutionRRef1),
    );
    expect(kref2).toBe(
      mockKernelStore.translateRefEtoK(remote.remoteId, mockURLResolutionRRef2),
    );
    // Verify they resolved independently (different values)
    expect(kref1).not.toBe(kref2);
  });

  describe('redeemOcapURL timeout', () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('sets up 30-second timeout using AbortSignal.timeout', async () => {
      const remote = makeRemote();
      const mockOcapURL = 'ocap:test@peer';

      let mockSignal: ReturnType<typeof makeAbortSignalMock> | undefined;
      vi.spyOn(AbortSignal, 'timeout').mockImplementation((ms: number) => {
        mockSignal = makeAbortSignalMock(ms);
        return mockSignal;
      });

      const urlPromise = remote.redeemOcapURL(mockOcapURL);

      // Verify AbortSignal.timeout was called with 30 seconds
      expect(AbortSignal.timeout).toHaveBeenCalledWith(30_000);
      expect(mockSignal?.timeoutMs).toBe(30_000);

      // Resolve the redemption to avoid hanging
      const sendCall = vi.mocked(mockRemoteComms.sendRemoteMessage).mock
        .calls[0];
      const sentMessage = JSON.parse(sendCall?.[1] as string);
      const replyKey = sentMessage.params[1] as string;

      await remote.handleRemoteMessage(
        JSON.stringify({
          method: 'redeemURLReply',
          params: [true, replyKey, 'ro+1'],
        }),
      );

      await urlPromise;
    });

    it('cleans up pending redemption when redemption succeeds before timeout', async () => {
      const remote = makeRemote();
      const mockOcapURL = 'ocap:test@peer';
      const mockURLResolutionRRef = 'ro+6';
      const mockURLResolutionKRef = 'ko1';
      const expectedReplyKey = '1';

      let mockSignal: ReturnType<typeof makeAbortSignalMock> | undefined;
      vi.spyOn(AbortSignal, 'timeout').mockImplementation((ms: number) => {
        mockSignal = makeAbortSignalMock(ms);
        return mockSignal;
      });

      const urlPromise = remote.redeemOcapURL(mockOcapURL);

      // Send reply immediately (before timeout)
      const redeemURLReply = {
        method: 'redeemURLReply',
        params: [true, expectedReplyKey, mockURLResolutionRRef],
      };
      await remote.handleRemoteMessage(JSON.stringify(redeemURLReply));

      const kref = await urlPromise;
      expect(kref).toBe(mockURLResolutionKRef);

      // Verify timeout signal was not aborted
      expect(mockSignal?.aborted).toBe(false);

      // Verify cleanup happened - trying to handle another reply with the same key should fail
      await expect(
        remote.handleRemoteMessage(JSON.stringify(redeemURLReply)),
      ).rejects.toThrow(`unknown URL redemption reply key ${expectedReplyKey}`);
    });

    it('cleans up pending redemption map entry on timeout', async () => {
      const remote = makeRemote();
      const mockOcapURL = 'ocap:test@peer';

      let mockSignal: ReturnType<typeof makeAbortSignalMock> | undefined;
      vi.spyOn(AbortSignal, 'timeout').mockImplementation((ms: number) => {
        mockSignal = makeAbortSignalMock(ms);
        return mockSignal;
      });

      // Start a redemption
      const urlPromise = remote.redeemOcapURL(mockOcapURL);

      // Get the reply key that was used
      const sendCall = vi.mocked(mockRemoteComms.sendRemoteMessage).mock
        .calls[0];
      const sentMessage = JSON.parse(sendCall?.[1] as string);
      const replyKey = sentMessage.params[1] as string;

      // Wait for the promise to be set up and event listener registered
      await new Promise<void>((resolve) => queueMicrotask(() => resolve()));

      // Manually trigger the abort to simulate timeout
      mockSignal?.abort();

      // Wait for the abort handler to execute
      await new Promise<void>((resolve) => queueMicrotask(() => resolve()));

      // Verify the promise rejects
      await expect(urlPromise).rejects.toThrow(
        'URL redemption timed out after 30 seconds',
      );

      // Verify cleanup happened - trying to handle a reply with the same key should fail
      const redeemURLReply = {
        method: 'redeemURLReply',
        params: [true, replyKey, 'ro+1'],
      };
      await expect(
        remote.handleRemoteMessage(JSON.stringify(redeemURLReply)),
      ).rejects.toThrow(`unknown URL redemption reply key ${replyKey}`);
    });
  });
});
