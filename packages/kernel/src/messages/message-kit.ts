import '@ocap/shims/endoify';

import type { Json } from '@metamask/utils';
import type { GuardType, TypeGuard } from '@ocap/utils';

import { isMessageLike, type MessageLike } from './message.js';
import type { UnionToIntersection } from './utils.js';
import { uncapitalize } from './utils.js';

// Message kit.

type BoolExpr = (value: unknown) => boolean;

type SourceLike = Record<string, [BoolExpr, BoolExpr]>;

type MessageUnion<Source extends SourceLike, Index extends 0 | 1> = {
  [Key in keyof Source]: Key extends string
    ? {
        method: Uncapitalize<Key>;
        params: GuardType<Source[Key][Index], Json>;
      }
    : never;
}[keyof Source];

export type Send<Source extends SourceLike> = MessageUnion<Source, 0>;

export type Reply<Source extends SourceLike> = MessageUnion<Source, 1>;

type MessageFunction<Union extends MessageLike, Return> = UnionToIntersection<
  {
    [Key in Union as Key['method']]: Key['params'] extends null
      ? (method: Key['method']) => Return
      : (method: Key['method'], params: Key['params']) => Return;
  }[Union['method']]
>;

/**
 * A typescript utility used to reduce boilerplate in message type declarations.
 *
 * @param sendGuard - A boolean expression that returns true for SendType values.
 * @param replyGuard - A boolean expression that returns true for ReplyType values.
 * @returns A pair of type guards.
 */
export const messageType = <SendType extends Json, ReplyType extends Json>(
  sendGuard: BoolExpr,
  replyGuard: BoolExpr,
): [TypeGuard<SendType>, TypeGuard<ReplyType>] => [
  (val): val is SendType => sendGuard(val),
  (val): val is ReplyType => replyGuard(val),
];

type Methods<Source> = {
  [Key in keyof Source]: Key extends string ? Uncapitalize<Key> : never;
};

const makeMethods = <Source extends object>(
  source: Source,
): Methods<Source> => {
  return Object.fromEntries(
    Object.keys(source).map((key) => [key, uncapitalize(key)]),
  ) as Methods<Source>;
};

const makeGuard = <Source extends SourceLike, Index extends 0 | 1>(
  source: Source,
  methods: Methods<Source>,
  index: Index,
): TypeGuard<MessageUnion<Source, Index>> => {
  const guards = Object.fromEntries(
    Object.entries(source).map(([key, value]) => [
      uncapitalize(key),
      value[index],
    ]),
  ) as Record<keyof Source, TypeGuard<unknown>>;

  return (value: unknown): value is MessageUnion<Source, Index> =>
    isMessageLike(value) &&
    Object.values(methods).includes(value.method) &&
    guards[value.method as keyof typeof guards](value.params);
};

// Applying ReturnType to the type of this function allows us to curry the
// template parameter Return.
type MakeMessageFunction<Union extends MessageLike> = <
  Return,
>() => MessageFunction<Union, Return>;

/**
 * An object type encapsulating all of the schematics that define a functional
 * group of messages.
 */
export type MessageKit<Source extends SourceLike> = {
  source: Source;
  methods: Methods<Source>;
  send: Send<Source>;
  sendGuard: TypeGuard<Send<Source>>;
  sendFunction: MakeMessageFunction<Send<Source>>;
  reply: Reply<Source>;
  replyGuard: TypeGuard<Reply<Source>>;
  replyFunction: MakeMessageFunction<Reply<Source>>;
};

export const makeMessageKit = <Source extends SourceLike>(
  source: Source,
): MessageKit<Source> => {
  const methods = makeMethods(source);

  return {
    source,
    methods,
    sendGuard: makeGuard(source, methods, 0),
    replyGuard: makeGuard(source, methods, 1),
  } as MessageKit<Source>;
};
