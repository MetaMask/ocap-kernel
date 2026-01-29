import { describe, it, expect, beforeEach } from 'vitest';

import { CrankBuffer } from './CrankBuffer.ts';
import type {
  RunQueueItemNotify,
  RunQueueItemSend,
  Message,
} from '../types.ts';

describe('CrankBuffer', () => {
  let buffer: CrankBuffer;

  const makeSendItem = (target: string, method: string): RunQueueItemSend => ({
    type: 'send',
    target,
    message: {
      methargs: { body: JSON.stringify([method]), slots: [] },
      result: null,
    } as Message,
  });

  const makeNotifyItem = (
    endpointId: string,
    kpid: string,
  ): RunQueueItemNotify => ({
    type: 'notify',
    endpointId,
    kpid,
  });

  beforeEach(() => {
    buffer = new CrankBuffer();
  });

  describe('bufferSend', () => {
    it('buffers a send item', () => {
      const item = makeSendItem('ko1', 'foo');
      buffer.bufferSend(item);
      expect(buffer).toHaveLength(1);
    });

    it('buffers multiple send items', () => {
      buffer.bufferSend(makeSendItem('ko1', 'foo'));
      buffer.bufferSend(makeSendItem('ko2', 'bar'));
      expect(buffer).toHaveLength(2);
    });
  });

  describe('bufferNotify', () => {
    it('buffers a notify item', () => {
      const item = makeNotifyItem('v1', 'kp1');
      buffer.bufferNotify(item);
      expect(buffer).toHaveLength(1);
    });

    it('buffers multiple notify items', () => {
      buffer.bufferNotify(makeNotifyItem('v1', 'kp1'));
      buffer.bufferNotify(makeNotifyItem('v2', 'kp2'));
      expect(buffer).toHaveLength(2);
    });
  });

  describe('interleaved items', () => {
    it('preserves order of interleaved sends and notifies', () => {
      const send1 = makeSendItem('ko1', 'foo');
      const notify1 = makeNotifyItem('v1', 'kp1');
      const send2 = makeSendItem('ko2', 'bar');
      const notify2 = makeNotifyItem('v2', 'kp2');

      buffer.bufferSend(send1);
      buffer.bufferNotify(notify1);
      buffer.bufferSend(send2);
      buffer.bufferNotify(notify2);

      const items = buffer.flush();
      expect(items).toStrictEqual([send1, notify1, send2, notify2]);
    });
  });

  describe('flush', () => {
    it('returns all buffered items', () => {
      const send = makeSendItem('ko1', 'foo');
      const notify = makeNotifyItem('v1', 'kp1');

      buffer.bufferSend(send);
      buffer.bufferNotify(notify);

      const items = buffer.flush();
      expect(items).toStrictEqual([send, notify]);
    });

    it('clears the buffer after flush', () => {
      buffer.bufferSend(makeSendItem('ko1', 'foo'));
      buffer.flush();
      expect(buffer).toHaveLength(0);
    });

    it('returns empty array when buffer is empty', () => {
      const items = buffer.flush();
      expect(items).toStrictEqual([]);
    });

    it('allows buffering after flush', () => {
      buffer.bufferSend(makeSendItem('ko1', 'foo'));
      buffer.flush();

      const newItem = makeSendItem('ko2', 'bar');
      buffer.bufferSend(newItem);

      const items = buffer.flush();
      expect(items).toStrictEqual([newItem]);
    });
  });

  describe('clear', () => {
    it('discards all buffered items', () => {
      buffer.bufferSend(makeSendItem('ko1', 'foo'));
      buffer.bufferNotify(makeNotifyItem('v1', 'kp1'));

      buffer.clear();

      expect(buffer).toHaveLength(0);
      expect(buffer.flush()).toStrictEqual([]);
    });

    it('does nothing when buffer is empty', () => {
      buffer.clear();
      expect(buffer).toHaveLength(0);
    });

    it('allows buffering after clear', () => {
      buffer.bufferSend(makeSendItem('ko1', 'foo'));
      buffer.clear();

      const newItem = makeSendItem('ko2', 'bar');
      buffer.bufferSend(newItem);

      expect(buffer.flush()).toStrictEqual([newItem]);
    });
  });

  describe('length', () => {
    it('returns 0 for empty buffer', () => {
      expect(buffer).toHaveLength(0);
    });

    it('returns correct count after buffering', () => {
      buffer.bufferSend(makeSendItem('ko1', 'foo'));
      expect(buffer).toHaveLength(1);

      buffer.bufferNotify(makeNotifyItem('v1', 'kp1'));
      expect(buffer).toHaveLength(2);
    });

    it('returns 0 after flush', () => {
      buffer.bufferSend(makeSendItem('ko1', 'foo'));
      buffer.flush();
      expect(buffer).toHaveLength(0);
    });

    it('returns 0 after clear', () => {
      buffer.bufferSend(makeSendItem('ko1', 'foo'));
      buffer.clear();
      expect(buffer).toHaveLength(0);
    });
  });
});
