export type MessageType =
  | 'capabilitySpecification'
  | 'user'
  | 'assistant'
  | 'capabilityResult';

/**
 * A message with a type and body, used for structured communication in agent transcripts.
 */
export class Message<
  Type extends MessageType,
  Body extends Record<string, unknown>,
> {
  messageType: Type;

  messageBody: Body;

  /**
   * Constructs a new {@link Message}.
   *
   * @param messageType - The type of the message.
   * @param messageBody - The body content of the message.
   */
  constructor(messageType: Type, messageBody: Body) {
    this.messageType = messageType;
    this.messageBody = messageBody;
  }

  /**
   * Serializes the message to a JSON string.
   *
   * @returns The JSON string representation of the message.
   */
  toJSON(): string {
    return JSON.stringify({
      ...this.messageBody,
      messageType: this.messageType,
    });
  }
}

export type Transcript = Message<MessageType, Record<string, unknown>>[];

/**
 * A message containing capability schemas for the agent to use.
 */
export class CapabilitySpecMessage extends Message<
  'capabilitySpecification',
  { schemas: object }
> {
  /**
   * Constructs a new {@link CapabilitySpecMessage}.
   *
   * @param schemas - The capability schemas describing available capabilities.
   */
  constructor(schemas: object) {
    super('capabilitySpecification', { schemas });
  }
}

/**
 * A message representing user input to the agent.
 */
export class UserMessage extends Message<'user', { content: string }> {
  /**
   * Constructs a new {@link UserMessage}.
   *
   * @param content - The user's message content.
   */
  constructor(content: string) {
    super('user', { content });
  }
}

export type Invocation = { name: string; args: object };

/**
 * A message representing the assistant's response, including optional thinking and capability invocations.
 */
export class AssistantMessage extends Message<
  'assistant',
  { think?: string[]; invoke: Invocation[] }
> {
  /**
   * Constructs a new {@link AssistantMessage}.
   *
   * @param options - The options for the assistant message.
   * @param options.think - The think to include in the message.
   * @param options.invoke - The invoke to include in the message.
   */
  constructor({ think, invoke }: { think?: string[]; invoke: Invocation[] }) {
    super('assistant', { think: think ?? [], invoke });
  }

  /**
   * Serializes the assistant message to a JSON string.
   *
   * @returns The JSON string.
   */
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

/**
 * A message containing the results of capability invocations.
 */
export class CapabilityResultMessage extends Message<
  'capabilityResult',
  { results: (Invocation & { result: unknown })[] }
> {
  /**
   * Constructs a new {@link CapabilityResultMessage}.
   *
   * @param results - The array of invocation results, each containing the invocation details and its result.
   */
  constructor(results: (Invocation & { result: unknown })[]) {
    super('capabilityResult', { results });
  }
}

export type CapabilityResultMessageJson = {
  messageType: 'capabilityResult';
  results: (Invocation & { result: unknown })[];
};

export type Observation =
  | UserMessage
  | CapabilitySpecMessage
  | CapabilityResultMessage;

export type Action = AssistantMessage;

export type State = (Observation | Action)[];
