import { describe, it, expect } from 'vitest';

import { AssistantMessage } from '../messages.ts';
import type { Transcript } from '../messages.ts';
import { makeChat } from './prompt.ts';

describe('makeChat', () => {
  it('should make a chat', () => {
    const chat = makeChat({}, 'test');
    expect(chat).toBeDefined();
    expect(chat).toHaveProperty('getPromptAndPrefix');
    expect(chat).toHaveProperty('pushMessages');
  });

  it('should get the prompt and prefix', () => {
    const chat = makeChat({}, 'test');
    const { prompt, prefix } = chat.getPromptAndPrefix();
    expect(prompt).toBeDefined();
    expect(prefix).toBeDefined();
  });

  it('should push a transcript', () => {
    const transcript: Transcript = [];
    const chat = makeChat({}, 'test', transcript);
    const testMessage = new AssistantMessage({ think: ['test'], invoke: [] });
    chat.pushMessages(testMessage);
    expect(transcript.pop()).toStrictEqual(testMessage);
  });
});
