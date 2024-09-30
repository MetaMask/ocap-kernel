import { messageType } from './message-kit.js';

export const vatTestCommand = {
  Evaluate: messageType<string, string>(
    (send) => typeof send === 'string',
    (reply) => typeof reply === 'string',
  ),

  Ping: messageType<null, 'pong'>(
    (send) => send === null,
    (reply) => reply === 'pong',
  ),
};
