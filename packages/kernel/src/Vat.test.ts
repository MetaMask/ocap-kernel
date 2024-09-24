import '@ocap/shims/endoify';
import { makeMessagePortStreamPair } from '@ocap/streams';
import { makeCapTpMock, makePromiseKitMock } from '@ocap/test-utils';
import {
  CommandMethod,
  makeStreamEnvelopeHandler,
  type Command,
  type StreamEnvelope,
} from '@ocap/utils';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { Vat } from './Vat.js';

vi.mock('@endo/captp', () => makeCapTpMock());

describe('Vat', () => {
  let vat: Vat;
  let port1: MessagePort;

  beforeEach(() => {
    vi.resetAllMocks();

    const messageChannel = new MessageChannel();
    port1 = messageChannel.port1;

    const streams = makeMessagePortStreamPair<StreamEnvelope>(port1);

    vat = new Vat({
      id: 'test-vat',
      streams,
    });
  });

  describe('init', () => {
    it('initializes the vat and sends a ping message', async () => {
      const sendMessageMock = vi
        .spyOn(vat, 'sendMessage')
        .mockResolvedValueOnce(undefined);
      const capTpMock = vi
        .spyOn(vat, 'makeCapTp')
        .mockResolvedValueOnce(undefined);

      await vat.init();

      expect(sendMessageMock).toHaveBeenCalledWith({
        type: CommandMethod.Ping,
        data: null,
      });
      expect(capTpMock).toHaveBeenCalled();
    });
  });

  describe('sendMessage', () => {
    it('sends a message and resolves the promise', async () => {
      const mockMessage = { type: 'makeCapTp', data: null } as Command;
      const sendMessagePromise = vat.sendMessage(mockMessage);
      vat.unresolvedMessages.get('test-vat-1')?.resolve('test-response');
      const result = await sendMessagePromise;
      expect(result).toBe('test-response');
    });
  });

  describe('terminate', () => {
    it('terminates the vat and resolves/rejects unresolved messages', async () => {
      const mockMessageId = 'test-vat-1';
      const mockPromiseKit = makePromiseKitMock().makePromiseKit();
      const mockSpy = vi.spyOn(mockPromiseKit, 'reject');
      vat.unresolvedMessages.set(mockMessageId, mockPromiseKit);
      await vat.terminate();
      expect(mockSpy).toHaveBeenCalledWith(expect.any(Error));
    });
  });

  describe('makeCapTp', () => {
    it('throws an error if CapTP connection already exists', async () => {
      // @ts-expect-error - Simulating an existing CapTP
      vat.capTp = {};
      await expect(vat.makeCapTp()).rejects.toThrow(
        `Vat with id "${vat.id}" already has a CapTP connection.`,
      );
    });

    it('creates a CapTP connection and sends CapTpInit message', async () => {
      vat.streamEnvelopeHandler = makeStreamEnvelopeHandler({}, console.warn);
      const sendMessageMock = vi
        .spyOn(vat, 'sendMessage')
        .mockResolvedValueOnce(undefined);
      await vat.makeCapTp();
      expect(vat.streamEnvelopeHandler.contentHandlers.capTp).toBeDefined();
      expect(sendMessageMock).toHaveBeenCalledWith({
        type: CommandMethod.CapTpInit,
        data: null,
      });
    });
  });

  describe('callCapTp', () => {
    it('throws an error if CapTP connection is not established', async () => {
      await expect(
        vat.callCapTp({ method: 'testMethod', params: [] }),
      ).rejects.toThrow(
        `Vat with id "test-vat" does not have a CapTP connection.`,
      );
    });
  });
});
