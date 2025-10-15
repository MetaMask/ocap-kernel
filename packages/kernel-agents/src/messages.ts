export type MessageType =
  | 'capabilitySpecification'
  | 'user'
  | 'assistant'
  | 'capabilityResult';

export class Message<
  Type extends MessageType,
  Body extends Record<string, unknown>,
> {
  messageType: Type;

  messageBody: Body;

  constructor(messageType: Type, messageBody: Body) {
    this.messageType = messageType;
    this.messageBody = messageBody;
  }

  toJSON(): string {
    return JSON.stringify({
      ...this.messageBody,
      messageType: this.messageType,
    });
  }
}

export type Transcript = Message<MessageType, Record<string, unknown>>[];

export class CapabilitySpecMessage extends Message<
  'capabilitySpecification',
  { schemas: object }
> {
  constructor(schemas: object) {
    super('capabilitySpecification', { schemas });
  }
}

export class UserMessage extends Message<'user', { content: string }> {
  constructor(content: string) {
    super('user', { content });
  }
}

export type Invocation = { name: string; args: object };

export class AssistantMessage extends Message<
  'assistant',
  { think?: string[]; invoke: Invocation[] }
> {
  constructor({ think, invoke }: { think?: string[]; invoke: Invocation[] }) {
    super('assistant', { think: think ?? [], invoke });
  }

  toJSON(): string {
    /* JSON.stringify will not preserve the order of the properties.
     * To utilize the conditional probability, think precedes invoke.
     * Manual serialization prints the properties in prompt order.
     */
    const messageType = '"messageType":"assistant",';
    const think = this.messageBody.think?.length
      ? `"think":${JSON.stringify(this.messageBody.think)},`
      : '';
    const invoke = `"invoke":${JSON.stringify(this.messageBody.invoke)}`;
    return ['{', messageType, think, invoke, '}'].join('');
  }
}

export type AssistantMessageJson = {
  messageType: 'assistant';
  think?: string[];
  invoke: Invocation[];
};

export class CapabilityResultMessage extends Message<
  'capabilityResult',
  { results: (Invocation & { result: unknown })[] }
> {
  constructor(results: (Invocation & { result: unknown })[]) {
    super('capabilityResult', { results });
  }
}

export type CapabilityResultMessageJson = {
  messageType: 'capabilityResult';
  results: (Invocation & { result: unknown })[];
};
