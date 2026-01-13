export type MessageTypeBase = string;

/**
 * An abstract base class for messages with a type and body.
 */
export abstract class Message<
  Type extends MessageTypeBase,
  Body extends Record<string, unknown> = Record<string, unknown>,
> {
  messageType: Type;

  messageBody: Body;

  /**
   * Constructs a new {@link Message}.
   *
   * @param messageType - The type identifier for the message.
   * @param messageBody - The body content of the message.
   */
  constructor(messageType: Type, messageBody: Body) {
    this.messageType = messageType;
    this.messageBody = messageBody;
  }
}

export type Transcript<
  MessageTypes extends MessageTypeBase,
  Interface = unknown,
> = (Message<MessageTypes> & Interface)[];
