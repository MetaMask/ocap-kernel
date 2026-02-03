import { describe, expect, it } from 'vitest';

import type {
  ColorWidgetState,
  HostMessage,
  IframeMessage,
  MainCapletState,
} from './types.ts';

describe('types', () => {
  describe('MainCapletState', () => {
    it('has expected shape', () => {
      const state: MainCapletState = {
        items: ['item1', 'item2'],
        counter: 5,
      };

      expect(state.items).toStrictEqual(['item1', 'item2']);
      expect(state.counter).toBe(5);
    });
  });

  describe('ColorWidgetState', () => {
    it('has expected shape', () => {
      const state: ColorWidgetState = {
        color: '#ff0000',
      };

      expect(state.color).toBe('#ff0000');
    });
  });

  describe('HostMessage', () => {
    it('supports init message with capletId', () => {
      const message: HostMessage<MainCapletState> = {
        capletId: 'main-caplet',
        type: 'init',
        state: { items: [], counter: 0 },
      };

      expect(message.capletId).toBe('main-caplet');
      expect(message.type).toBe('init');
    });

    it('supports state-update message with capletId', () => {
      const message: HostMessage<MainCapletState> = {
        capletId: 'main-caplet',
        type: 'state-update',
        state: { items: ['test'], counter: 1 },
      };

      expect(message.capletId).toBe('main-caplet');
      expect(message.type).toBe('state-update');
    });

    it('supports method-response message with capletId', () => {
      const success: HostMessage = {
        capletId: 'main-caplet',
        type: 'method-response',
        id: 'call-1',
        result: 'ok',
      };

      const error: HostMessage = {
        capletId: 'main-caplet',
        type: 'method-response',
        id: 'call-2',
        error: 'Something went wrong',
      };

      expect(success.capletId).toBe('main-caplet');
      expect(error.capletId).toBe('main-caplet');
    });
  });

  describe('IframeMessage', () => {
    it('supports ready message with capletId', () => {
      const message: IframeMessage = {
        capletId: 'main-caplet',
        type: 'ready',
      };

      expect(message.capletId).toBe('main-caplet');
      expect(message.type).toBe('ready');
    });

    it('supports method-call message with capletId', () => {
      const message: IframeMessage = {
        capletId: 'color-widget',
        type: 'method-call',
        id: 'call-1',
        method: 'setColor',
        args: ['#ff0000'],
      };

      expect(message.capletId).toBe('color-widget');
      expect(message.type).toBe('method-call');
    });
  });
});
