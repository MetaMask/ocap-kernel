import { describe, it, expect } from 'vitest';

import { AssistantMessage } from './messages.ts';

describe('AssistantMessage', () => {
  it('should create an assistant message', () => {
    const message = new AssistantMessage({ think: ['test'], invoke: [] });
    expect(message).toBeDefined();
  });

  it('serializes think before invoke if present', () => {
    const message = new AssistantMessage({
      invoke: [{ name: 'test', args: {} }],
      think: ['test'],
    });
    const json = message.toJSON();
    const [left, right] = json.split('think');
    expect(left).toContain('messageType');
    expect(left).not.toContain('invoke');
    expect(right).not.toContain('messageType');
    expect(right).toContain('invoke');
  });

  it('serializes if think is not present', () => {
    const message = new AssistantMessage({
      invoke: [{ name: 'test', args: {} }],
    });
    const json = message.toJSON();
    expect(json).toContain('messageType');
    expect(json).not.toContain('think');
    expect(json).toContain('invoke');
  });
});
