import { describe, it, expect } from 'vitest';

import { AssistantMessage } from './messages.ts';

describe('AssistantMessage', () => {
  it('creates an assistant message', () => {
    const message = new AssistantMessage({ think: ['test'], invoke: [] });
    expect(message).toBeDefined();
  });

  it('serializes think before invoke', () => {
    const message = new AssistantMessage({
      invoke: [{ name: 'test', args: {} }],
      think: ['test'],
    });
    const json = message.toJSON();
    expect(json.indexOf('think')).toBeLessThan(json.indexOf('invoke'));
  });

  it('serializes without think when absent', () => {
    const message = new AssistantMessage({
      invoke: [{ name: 'test', args: {} }],
    });
    const json = message.toJSON();
    expect(json).not.toContain('think');
    expect(json).toContain('invoke');
  });
});
