import { Logger } from '@metamask/logger';
import { describe, it, expect, beforeEach, vi } from 'vitest';

import {
  isHandshakeMessage,
  performInboundHandshake,
  performOutboundHandshake,
} from './handshake.ts';
import type { HandshakeDeps, HandshakeMessage } from './handshake.ts';
import type { Channel } from '../types.ts';

describe('handshake', () => {
  describe('isHandshakeMessage', () => {
    it('returns true for handshake message', () => {
      const message: HandshakeMessage = {
        method: 'handshake',
        params: { incarnationId: 'test-id' },
      };
      expect(isHandshakeMessage(message)).toBe(true);
    });

    it('returns true for handshakeAck message', () => {
      const message: HandshakeMessage = {
        method: 'handshakeAck',
        params: { incarnationId: 'test-id' },
      };
      expect(isHandshakeMessage(message)).toBe(true);
    });

    it('returns false for null', () => {
      expect(isHandshakeMessage(null)).toBe(false);
    });

    it('returns false for non-object', () => {
      expect(isHandshakeMessage('string')).toBe(false);
      expect(isHandshakeMessage(123)).toBe(false);
      expect(isHandshakeMessage(undefined)).toBe(false);
    });

    it('returns false for object with different method', () => {
      expect(isHandshakeMessage({ method: 'delivery' })).toBe(false);
      expect(isHandshakeMessage({ method: 'other' })).toBe(false);
    });

    it('returns false for object without method', () => {
      expect(isHandshakeMessage({ params: {} })).toBe(false);
    });

    it('returns false for handshake message without params', () => {
      expect(isHandshakeMessage({ method: 'handshake' })).toBe(false);
      expect(isHandshakeMessage({ method: 'handshakeAck' })).toBe(false);
    });

    it('returns false for handshake message with non-object params', () => {
      expect(isHandshakeMessage({ method: 'handshake', params: null })).toBe(
        false,
      );
      expect(
        isHandshakeMessage({ method: 'handshake', params: 'string' }),
      ).toBe(false);
    });

    it('returns false for handshake message without incarnationId', () => {
      expect(isHandshakeMessage({ method: 'handshake', params: {} })).toBe(
        false,
      );
      expect(
        isHandshakeMessage({
          method: 'handshakeAck',
          params: { other: 'data' },
        }),
      ).toBe(false);
    });

    it('returns false for handshake message with non-string incarnationId', () => {
      expect(
        isHandshakeMessage({
          method: 'handshake',
          params: { incarnationId: 123 },
        }),
      ).toBe(false);
      expect(
        isHandshakeMessage({
          method: 'handshakeAck',
          params: { incarnationId: null },
        }),
      ).toBe(false);
    });
  });

  describe('performOutboundHandshake', () => {
    let mockChannel: Channel;
    let mockDeps: HandshakeDeps;
    let logger: Logger;

    beforeEach(() => {
      logger = new Logger();
      vi.spyOn(logger, 'log');

      mockChannel = {
        peerId: 'test-peer-id',
        msgStream: {
          write: vi.fn().mockResolvedValue(undefined),
          read: vi.fn(),
          unwrap: vi.fn(),
        },
      } as unknown as Channel;

      mockDeps = {
        localIncarnationId: 'local-incarnation-123',
        logger,
        setRemoteIncarnation: vi.fn().mockReturnValue(false),
      };
    });

    it('sends handshake and waits for handshakeAck', async () => {
      const handshakeAck = JSON.stringify({
        method: 'handshakeAck',
        params: { incarnationId: 'remote-incarnation-456' },
      });
      vi.spyOn(mockChannel.msgStream, 'read')
        .mockImplementation()
        .mockResolvedValueOnce({
          subarray: () => new TextEncoder().encode(handshakeAck),
        });

      const result = await performOutboundHandshake(mockChannel, mockDeps);

      // Verify handshake was sent
      expect(mockChannel.msgStream.write).toHaveBeenCalledTimes(1);
      const writeCall = mockChannel.msgStream.write as ReturnType<typeof vi.fn>;
      const sentData = new TextDecoder().decode(
        writeCall.mock.calls[0][0] as Uint8Array,
      );
      const sentMessage = JSON.parse(sentData);
      expect(sentMessage).toStrictEqual({
        method: 'handshake',
        params: { incarnationId: 'local-incarnation-123' },
      });

      // Verify result
      expect(result.remoteIncarnationId).toBe('remote-incarnation-456');
      expect(result.incarnationChanged).toBe(false);

      // Verify incarnation was set
      expect(mockDeps.setRemoteIncarnation).toHaveBeenCalledWith(
        'test-peer-id',
        'remote-incarnation-456',
      );
    });

    it('returns incarnationChanged=true when incarnation changes', async () => {
      const handshakeAck = JSON.stringify({
        method: 'handshakeAck',
        params: { incarnationId: 'new-incarnation' },
      });
      vi.spyOn(mockChannel.msgStream, 'read')
        .mockImplementation()
        .mockResolvedValueOnce({
          subarray: () => new TextEncoder().encode(handshakeAck),
        });
      (
        mockDeps.setRemoteIncarnation as ReturnType<typeof vi.fn>
      ).mockReturnValue(true);

      const result = await performOutboundHandshake(mockChannel, mockDeps);

      expect(result.incarnationChanged).toBe(true);
    });

    it('throws when response is not handshakeAck', async () => {
      const wrongResponse = JSON.stringify({
        method: 'handshake', // Wrong! Should be handshakeAck
        params: { incarnationId: 'remote-incarnation' },
      });
      vi.spyOn(mockChannel.msgStream, 'read')
        .mockImplementation()
        .mockResolvedValueOnce({
          subarray: () => new TextEncoder().encode(wrongResponse),
        });

      await expect(
        performOutboundHandshake(mockChannel, mockDeps),
      ).rejects.toThrow('Expected handshakeAck');
    });

    it('throws when response is not valid JSON', async () => {
      vi.spyOn(mockChannel.msgStream, 'read')
        .mockImplementation()
        .mockResolvedValueOnce({
          subarray: () => new TextEncoder().encode('not json'),
        });

      await expect(
        performOutboundHandshake(mockChannel, mockDeps),
      ).rejects.toThrow('JSON');
    });
  });

  describe('performInboundHandshake', () => {
    let mockChannel: Channel;
    let mockDeps: HandshakeDeps;
    let logger: Logger;

    beforeEach(() => {
      logger = new Logger();
      vi.spyOn(logger, 'log');

      mockChannel = {
        peerId: 'test-peer-id',
        msgStream: {
          write: vi.fn().mockResolvedValue(undefined),
          read: vi.fn(),
          unwrap: vi.fn(),
        },
      } as unknown as Channel;

      mockDeps = {
        localIncarnationId: 'local-incarnation-123',
        logger,
        setRemoteIncarnation: vi.fn().mockReturnValue(false),
      };
    });

    it('waits for handshake and sends handshakeAck', async () => {
      const handshake = JSON.stringify({
        method: 'handshake',
        params: { incarnationId: 'remote-incarnation-456' },
      });
      vi.spyOn(mockChannel.msgStream, 'read')
        .mockImplementation()
        .mockResolvedValueOnce({
          subarray: () => new TextEncoder().encode(handshake),
        });

      const result = await performInboundHandshake(mockChannel, mockDeps);

      // Verify handshakeAck was sent
      expect(mockChannel.msgStream.write).toHaveBeenCalledTimes(1);
      const writeCall = mockChannel.msgStream.write as ReturnType<typeof vi.fn>;
      const sentData = new TextDecoder().decode(
        writeCall.mock.calls[0][0] as Uint8Array,
      );
      const sentMessage = JSON.parse(sentData);
      expect(sentMessage).toStrictEqual({
        method: 'handshakeAck',
        params: { incarnationId: 'local-incarnation-123' },
      });

      // Verify result
      expect(result.remoteIncarnationId).toBe('remote-incarnation-456');
      expect(result.incarnationChanged).toBe(false);

      // Verify incarnation was set
      expect(mockDeps.setRemoteIncarnation).toHaveBeenCalledWith(
        'test-peer-id',
        'remote-incarnation-456',
      );
    });

    it('returns incarnationChanged=true when incarnation changes', async () => {
      const handshake = JSON.stringify({
        method: 'handshake',
        params: { incarnationId: 'new-incarnation' },
      });
      vi.spyOn(mockChannel.msgStream, 'read')
        .mockImplementation()
        .mockResolvedValueOnce({
          subarray: () => new TextEncoder().encode(handshake),
        });
      (
        mockDeps.setRemoteIncarnation as ReturnType<typeof vi.fn>
      ).mockReturnValue(true);

      const result = await performInboundHandshake(mockChannel, mockDeps);

      expect(result.incarnationChanged).toBe(true);
    });

    it('throws when first message is not handshake', async () => {
      const wrongMessage = JSON.stringify({
        method: 'handshakeAck', // Wrong! Should be handshake
        params: { incarnationId: 'remote-incarnation' },
      });
      vi.spyOn(mockChannel.msgStream, 'read')
        .mockImplementation()
        .mockResolvedValueOnce({
          subarray: () => new TextEncoder().encode(wrongMessage),
        });

      await expect(
        performInboundHandshake(mockChannel, mockDeps),
      ).rejects.toThrow('Expected handshake');
    });

    it('throws when channel closes during read', async () => {
      vi.spyOn(mockChannel.msgStream, 'read')
        .mockImplementation()
        .mockResolvedValueOnce(undefined);

      await expect(
        performInboundHandshake(mockChannel, mockDeps),
      ).rejects.toThrow('Channel closed during handshake');
    });
  });
});
