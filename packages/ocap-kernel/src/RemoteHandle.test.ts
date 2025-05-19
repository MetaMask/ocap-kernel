import type { VatOneResolution } from '@agoric/swingset-liveslots';
import type { Logger } from '@metamask/logger';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import type { KernelQueue } from './KernelQueue.ts';
import { RemoteHandle } from './RemoteHandle.ts';
import { makeKernelStore } from './store/index.ts';
import type { KernelStore } from './store/index.ts';
import type { Message, RemoteComms, RRef } from './types.ts';
import { makeMapKernelDatabase } from '../test/storage.ts';

let mockKernelStore: KernelStore;
let mockRemoteComms: RemoteComms;
let mockKernelQueue: KernelQueue;
const mockRemoteId = 'r0';
const mockRemotePeerId = 'remotePeerId';

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
    mockKernelStore = makeKernelStore(makeMapKernelDatabase());
    const mockRedeemLocalOcapURL = vi.fn();
    mockRedeemLocalOcapURL.mockReturnValue('ko100');
    mockRemoteComms = {
      getPeerId: () => 'myPeerId',
      sendRemoteMessage: vi.fn(),
      issueOcapURL: vi.fn(),
      redeemLocalOcapURL: mockRedeemLocalOcapURL,
    };
    mockKernelQueue = {
      run: vi.fn(),
      enqueueMessage: vi.fn(),
      enqueueSend: vi.fn(),
      enqueueNotify: vi.fn(),
      resolvePromises: vi.fn(),
    } as unknown as KernelQueue;
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
    expect(crankResult).toStrictEqual({ didDelivery: mockRemoteId });
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
    expect(crankResult).toStrictEqual({ didDelivery: mockRemoteId });
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
    expect(crankResult).toStrictEqual({ didDelivery: mockRemoteId });
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
    expect(crankResult).toStrictEqual({ didDelivery: mockRemoteId });
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
    expect(crankResult).toStrictEqual({ didDelivery: mockRemoteId });
  });

  it('deliverBringOutYourDead does not call sendRemoteMessage', async () => {
    const remote = makeRemote();

    const crankResult = await remote.deliverBringOutYourDead();
    expect(mockRemoteComms.sendRemoteMessage).not.toHaveBeenCalled();
    expect(crankResult).toStrictEqual({ didDelivery: mockRemoteId });
  });

  it('redeemOcapURL calls sendRemoteMessage correctly and handles expected reply (success)', async () => {
    const remote = makeRemote();
    const mockOcapURL = 'as if it was a URL';
    const mockURLResolutionRRef = 'ro+6';
    const mockURLResolutionKRef = 'ko1';
    const expectedReplyKey = '1';

    const urlPromise = remote.redeemOcapURL(mockOcapURL);
    expect(mockRemoteComms.sendRemoteMessage).toHaveBeenCalledWith(
      mockRemotePeerId,
      JSON.stringify({
        method: 'redeemURL',
        params: [mockOcapURL, expectedReplyKey],
      }),
    );
    const redeemURLReply = {
      method: 'redeemURLReply',
      params: [true, expectedReplyKey, mockURLResolutionRRef],
    };
    await remote.handleRemoteMessage(JSON.stringify(redeemURLReply));
    const kref = await urlPromise;
    expect(kref).toBe(mockURLResolutionKRef);
    expect(
      mockKernelStore.translateRefEtoK(mockRemoteId, mockURLResolutionRRef),
    ).toBe(mockURLResolutionKRef);
  });

  it('redeemOcapURL calls sendRemoteMessage correctly and handles expected reply (failure)', async () => {
    const remote = makeRemote();
    const mockOcapURL = 'as if it was a URL';
    const expectedReplyKey = '1';

    const urlPromise = remote.redeemOcapURL(mockOcapURL);
    expect(mockRemoteComms.sendRemoteMessage).toHaveBeenCalledWith(
      mockRemotePeerId,
      JSON.stringify({
        method: 'redeemURL',
        params: [mockOcapURL, expectedReplyKey],
      }),
    );
    const redeemURLReply = {
      method: 'redeemURLReply',
      params: [false, expectedReplyKey],
    };
    await remote.handleRemoteMessage(JSON.stringify(redeemURLReply));
    await expect(urlPromise).rejects.toThrow(
      `vitest ignores this string but lint complains if it's not here`,
    );
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
    expect(mockKernelStore.translateRefEtoK(mockRemoteId, targetRRef)).toBe(
      targetKRef,
    );
    expect(mockKernelStore.translateRefEtoK(mockRemoteId, resultRRef)).toBe(
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
    expect(mockKernelQueue.resolvePromises).toHaveBeenCalledWith(mockRemoteId, [
      [promiseKRef, false, { body: '"resolved value"', slots: [] }],
    ]);
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
      mockKernelStore.translateRefKtoE(mockRemoteId, replyKRef, false),
    ).toBe(replyRRef);
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
});
