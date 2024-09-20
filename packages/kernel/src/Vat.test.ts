import '@ocap/shims/endoify';
import type { StreamPair, StreamEnvelope, VatMessage } from '@ocap/streams';
import { makePromiseKitMock } from '@ocap/test-utils';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { Vat } from './Vat.js';

vi.mock('@endo/promise-kit', () => makePromiseKitMock());

vi.mock('@endo/captp', () => {
  return {
    makeCapTP: vi.fn(() => ({
      getBootstrap: vi.fn(() => ({
        testMethod: vi.fn().mockResolvedValue('test-result'),
      })),
    })),
  };
});

describe('Vat', () => {
  let mockStreams: StreamPair<StreamEnvelope>;
  let vat: Vat;

  beforeEach(() => {
    vi.resetAllMocks();

    // Mock the streams
    mockStreams = {
      reader: {
        // @ts-expect-error We are mocking the async iterator
        async *[Symbol.asyncIterator]() {
          yield {
            label: 'test-label',
            message: {} as VatMessage,
          };
        },
        return: vi.fn().mockResolvedValue(undefined),
        throw: vi.fn(),
      },
      writer: {
        next: vi.fn().mockResolvedValue({ done: false }),
        return: vi.fn().mockResolvedValue(undefined),
        throw: vi.fn(),
        // @ts-expect-error We are mocking the async iterator
        async *[Symbol.asyncIterator]() {
          yield {};
        },
      },
      return: vi.fn().mockResolvedValue(undefined),
      throw: vi.fn().mockResolvedValue(undefined),
    };

    // Create a new instance of the Vat class
    vat = new Vat({
      id: 'test-vat',
      streams: mockStreams,
    });
  });

  describe('#init', () => {
    it('initializes the vat and sends a ping message', async () => {
      const sendMessageMock = vi
        .spyOn(vat, 'sendMessage')
        .mockResolvedValueOnce(undefined);
      const makeCapTpMock = vi
        .spyOn(vat, 'makeCapTp')
        .mockResolvedValueOnce(undefined);

      await vat.init();

      expect(sendMessageMock).toHaveBeenCalledWith({
        type: 'ping',
        data: null,
      });
      expect(makeCapTpMock).toHaveBeenCalled();
    });
  });

  describe('#sendMessage', () => {
    it('sends a message and resolves the promise', async () => {
      const mockMessage = { type: 'makeCapTp', data: null } as VatMessage;
      const sendMessagePromise = vat.sendMessage(mockMessage);
      vat.unresolvedMessages.get('test-vat-1')?.resolve('test-response');
      const result = await sendMessagePromise;
      expect(result).toBe('test-response');
    });
  });

  describe('#terminate', () => {
    it('terminates the vat and resolves/rejects unresolved messages', async () => {
      const mockMessageId = 'test-vat-1';
      const mockPromiseKit = makePromiseKitMock().makePromiseKit();
      const mockSpy = vi.spyOn(mockPromiseKit, 'reject');
      vat.unresolvedMessages.set(mockMessageId, mockPromiseKit);
      await vat.terminate();
      expect(mockSpy).toHaveBeenCalledWith(expect.any(Error));
    });
  });

  describe('#makeCapTp', () => {
    it('throws an error if CapTP connection already exists', async () => {
      // @ts-expect-error - Simulating an existing CapTP
      vat.capTp = {};

      await expect(vat.makeCapTp()).rejects.toThrow(
        `Vat with id "${vat.id}" already has a CapTP connection.`,
      );
    });

    it('throws an error if stream envelope handler is not initialized', async () => {
      // @ts-expect-error - Simulate the stream envelope handler not being set
      vat.streamEnvelopeHandler = undefined;

      await expect(vat.makeCapTp()).rejects.toThrow(
        `Vat with id "${vat.id}" does not have a stream envelope handler.`,
      );
    });

    it('creates a CapTP connection and sends CapTpInit message', async () => {
      const streamEnvelopeHandlerMock = {
        contentHandlers: { capTp: undefined },
      };
      // @ts-expect-error - Set the streamEnvelopeHandler in the vat instance
      vat.streamEnvelopeHandler = streamEnvelopeHandlerMock;

      const sendMessageSpy = vi
        .spyOn(vat, 'sendMessage')
        .mockResolvedValue(undefined);

      vi.spyOn(mockStreams.writer, 'next').mockResolvedValue({
        done: false,
        value: undefined,
      });

      await vat.makeCapTp();

      expect(sendMessageSpy).toHaveBeenCalledWith({
        type: 'makeCapTp',
        data: null,
      });
      expect(streamEnvelopeHandlerMock.contentHandlers.capTp).toBeDefined();
    });
  });

  describe('#callCapTp', () => {
    it('throws an error if no CapTP connection exists', async () => {
      // Ensure no CapTP connection exists in the vat instance
      // @ts-expect-error - Simulate the CapTP connection not being set
      vat.capTp = undefined;

      const payload = {
        method: 'testMethod',
        params: ['param1', 'param2'],
      };

      await expect(vat.callCapTp(payload)).rejects.toThrow(
        `Vat with id "${vat.id}" does not have a CapTP connection.`,
      );
    });
  });
});
