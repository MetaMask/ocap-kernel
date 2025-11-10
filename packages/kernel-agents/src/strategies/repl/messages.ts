import { stringify } from '@metamask/kernel-utils';
import type { SyntaxNode } from 'tree-sitter';

import { makeCompartment } from './compartment.ts';
import { parse } from './parse/javascript.ts';
import { ERROR, RETURN } from './symbols.ts';
import { Message } from '../../types/messages.ts';
import type { Transcript } from '../../types/messages.ts';

export type StatementType = 'import' | 'evaluation' | 'comment';

export type ReplMessageType = StatementType | 'interjection' | 'result';

export type ReplObservable = {
  toReplString(): string;
};

export type JsonObservable = {
  toJsonString(): string;
};

type JsonKey = string | number;

type Primitive = string | number | boolean | null | undefined;

type JsonObservation =
  | Primitive
  | JsonObservable
  | JsonObservation[]
  | { [key: JsonKey]: JsonObservation };

const isJsonObservable = (value: unknown): value is JsonObservable =>
  typeof value === 'object' && value !== null && 'toJsonString' in value;

export const observeJson = (value: JsonObservation): string =>
  isJsonObservable(value) ? value.toJsonString() : stringify(value);

export abstract class ReplMessage<
    Type extends ReplMessageType,
    Body extends Record<JsonKey, JsonObservation | SyntaxNode>,
  >
  extends Message<Type, Body>
  implements ReplObservable, JsonObservable
{
  toJsonString(): string {
    const messageType = `"messageType": "${this.messageType}"`;
    const bodyEntries = Object.entries(this.messageBody)
      .filter(([, value]) => isJsonObservable(value))
      .map(
        ([key, value]) => `"${key}": ${observeJson(value as JsonObservation)}`,
      );
    return `{ ${messageType}, ${bodyEntries.join(', ')} }`;
  }

  abstract toReplString(): string;
}

// Statements comprise the action space of the REPL agent.
export class StatementMessage<
  Type extends StatementType = StatementType,
> extends ReplMessage<Type, { code: string; node: SyntaxNode }> {
  toReplString(): string {
    return `> ${this.messageBody.code}`;
  }

  static fromCode(code: string): StatementMessage {
    return statementMessageFromCode(code);
  }
}

const parseStatement = (
  code: string,
  name?: string,
  bound?: StatementType[],
): SyntaxNode => {
  const { rootNode } = parse(code);
  const [statement] = rootNode.children as [SyntaxNode];
  if (bound && !bound.includes(statement.type as StatementType)) {
    throw new Error(`"${code}" is not a valid ${name}.`);
  }
  return statement;
};

export class CommentMessage extends StatementMessage<'comment'> {
  constructor(code: string, statement?: SyntaxNode) {
    const node = statement ?? parseStatement(code, 'comment');
    super('comment', { code, node });
  }
}

export class ImportMessage extends StatementMessage<'import'> {
  constructor(code: string, statement?: SyntaxNode) {
    const node = statement ?? parseStatement(code, 'import_statement');
    super('import', { code, node });
  }

  static fromNames(names: string[]): ImportMessage {
    const code = `import { ${names.join(', ')} } from "@ocap/abilities";`;
    return new ImportMessage(code);
  }
}

export class EvaluationMessage extends StatementMessage<'evaluation'> {
  constructor(code: string, statement?: SyntaxNode) {
    const node = statement ?? parseStatement(code, 'expression_statement');
    super('evaluation', { code, node });
  }
}

/**
 * Make a statement message from code.
 *
 * @param code - The code to parse.
 * @returns A statement message.
 */
function statementMessageFromCode(code: string): StatementMessage {
  const { rootNode } = parse(code);
  const [statement] = rootNode.children as [SyntaxNode];
  switch (statement.type) {
    case 'comment':
      return new CommentMessage(code, statement);
    case 'import_statement':
      return new ImportMessage(code, statement);
    default: // XXX Maybe too permissive as the default case.
      return new EvaluationMessage(code, statement);
  }
}

export class InterjectionMessage extends ReplMessage<
  'interjection',
  { interjection: string }
> {
  constructor(interjection: string) {
    super('interjection', { interjection });
  }

  toReplString(): string {
    return `! ${this.messageBody.interjection}`;
  }
}

const $stringify = harden(stringify);

export const MAX_LINES = 20;
const HEAD_LENGTH = 14;
const ELLIPSIS = '// ...';

const hardenEntry = ([key, value]: [string, unknown]): [string, string] => {
  const hardValue = harden(value);
  const compartment = makeCompartment({ hardValue, $stringify });
  const stringified = compartment.evaluate('$stringify(hardValue);') as string;
  return [key, stringified];
};

type ResultMessageBody = { value?: string; error?: string; return?: string };

const compressLines = (
  lines: string[],
  {
    maxLines = MAX_LINES,
    headLength = HEAD_LENGTH,
    ellipsis = ELLIPSIS,
  }: { maxLines?: number; headLength?: number; ellipsis?: string } = {},
): string[] =>
  lines.length > maxLines
    ? [
        ...lines.slice(0, headLength),
        ellipsis,
        ...lines.slice(-(maxLines - headLength - 1)),
      ]
    : lines;

type ResultArg = {
  value?: Record<string, unknown>;
  [ERROR]?: unknown;
  [RETURN]?: unknown;
};

export class ResultMessage extends ReplMessage<'result', ResultMessageBody> {
  readonly #compress: boolean;

  constructor(
    result: ResultArg,
    { compress = true }: { compress?: boolean } = {},
  ) {
    const messageBody: ResultMessageBody = {};
    if (Object.hasOwn(result, ERROR)) {
      const error = result[ERROR] as Error;
      messageBody.error = `${error.name}: ${error.message}`;
    }
    if (Object.hasOwn(result, RETURN)) {
      messageBody.return = hardenEntry(['', result[RETURN]])[1];
    }
    if (Object.hasOwn(result, 'value')) {
      messageBody.value = Object.entries(
        result.value as Record<string, unknown>,
      )
        .map(hardenEntry)
        .map(([key, val]) => `${key}: ${val}`)
        .join('\n');
    }
    super('result', messageBody);
    this.#compress = compress;
  }

  toReplString(): string {
    const lines = {
      error: this.messageBody.error?.split('\n') ?? [],
      return: this.messageBody.return?.split('\n') ?? [],
      value: this.messageBody.value?.split('\n') ?? [],
    };
    const transform = this.#compress
      ? compressLines
      : (value: string[]) => value;
    return [
      ...transform(lines.error),
      ...transform(lines.return),
      ...transform(lines.value),
    ].join('\n');
  }
}

export type ReplTranscript = Transcript<ReplMessageType, ReplObservable>;

export type Observation = InterjectionMessage | ResultMessage;

export type Action = StatementMessage;

export type State = (Observation | Action)[];
