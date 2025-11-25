export type MessageTypeBase = string;

export abstract class Message<
  Type extends MessageTypeBase,
  Body extends Record<string, unknown> = Record<string, unknown>,
> {
  messageType: Type;

  messageBody: Body;

  constructor(messageType: Type, messageBody: Body) {
    this.messageType = messageType;
    this.messageBody = messageBody;
  }
}

export type Transcript<
  MessageTypes extends MessageTypeBase,
  Interface = unknown,
> = (Message<MessageTypes> & Interface)[];
