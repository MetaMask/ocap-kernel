import { Command, isWrappedIframeMessage } from './shared.js';

const defaultCompartment = new Compartment({ URL });

type MessageEventWithSource = Omit<MessageEvent, 'source'> & {
  source: NonNullable<MessageEvent['source']>;
};

const isEventWithSource = (
  event: MessageEvent,
): event is MessageEventWithSource => event.source !== null;

window.addEventListener('message', (event: MessageEvent) => {
  console.debug('iframe received message', event);

  if (!isEventWithSource(event)) {
    console.warn('iframe received message with null source');
    return;
  }
  if (!isWrappedIframeMessage(event.data)) {
    console.warn('iframe received message with unexpected format', event.data);
    return;
  }

  const { id, message } = event.data;

  switch (message.type) {
    case Command.Evaluate: {
      const result = safelyEvaluate(message.data);
      reply(event, id, Command.Evaluate, stringifyResult(result));
      break;
    }
    case Command.Ping:
      reply(event, id, Command.Ping, 'pong');
      break;
    default:
      console.error(
        // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
        `iframe received unexpected message type: "${message.type}"`,
      );
  }
});

/**
 * Evaluate a string in the default compartment.
 * @param source - The source string to evaluate.
 * @returns The result of the evaluation, or an error message.
 */
function safelyEvaluate(source: string) {
  try {
    return defaultCompartment.evaluate(source);
  } catch (error) {
    if (error instanceof Error) {
      return `Error: ${error.message}`;
    }
    return `Error: Unknown error during evaluation.`;
  }
}

/**
 * Stringify an evaluation result.
 * @param result - The result to stringify.
 * @returns The stringified result.
 */
function stringifyResult(result: unknown) {
  try {
    return JSON.stringify(result, null, 2);
  } catch {
    return String(result);
  }
}

/**
 * Reply to the parent window.
 * @param event - The message event to respond to.
 * @param id - The id of the message to reply to.
 * @param messageType - The message type.
 * @param data - The message data.
 */
function reply(
  event: MessageEventWithSource,
  id: string,
  messageType: Command,
  data: string,
) {
  event.source.postMessage(
    { id, message: { type: messageType, data } },
    // @ts-expect-error Incorrect DOM types
    event.origin,
  );
}
