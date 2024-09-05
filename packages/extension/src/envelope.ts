import { isObject } from '@metamask/utils';

import type { DataObject } from './data-object.js';

export type Envelope<
  Label extends string,
  Message extends DataObject = DataObject,
> = {
  label: Label;
  message: Message;
};

export const isLabelledMessage = (
  value: unknown,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): value is { label: string; message: any } =>
  isObject(value) &&
  typeof value.label === 'string' &&
  typeof value.message !== 'undefined';

export const makeIsEnvelope =
  <Label extends string, Message extends DataObject>(args: {
    label: Label;
    isMessage?: ((value: unknown) => value is Message) | undefined;
  }) =>
  (value: unknown): value is Envelope<Label, Message> => {
    const { label, isMessage } = args;
    return (
      isObject(value) &&
      typeof value.label === 'string' &&
      typeof value.message !== 'undefined' &&
      value.label === label &&
      (isMessage === undefined || isMessage(value.message))
    );
  };

export type MessageOf<Env> = Env extends Envelope<string, infer M> ? M : never;
export type LabelOf<Env> = Env extends Envelope<infer L> ? L : never;

export type GenericEnvelope<Env> = Envelope<LabelOf<Env>, MessageOf<Env>>;

export type Enveloper<Env extends GenericEnvelope<Env>> = {
  label: LabelOf<Env>;
  check: (value: unknown) => value is Env;
  wrap: (message: MessageOf<Env>) => Env;
  unwrap: (envelope: Env) => MessageOf<Env>;
};

export const makeEnveloper = <Env extends GenericEnvelope<Env>>(args: {
  label: LabelOf<Env>;
  wrap?: (message: MessageOf<Env>) => Env;
  isMessage?: ((value: unknown) => value is MessageOf<Env>) | undefined;
}): Enveloper<Env> => {
  const { label, wrap, isMessage } = args;
  const isE = makeIsEnvelope({ label, isMessage });
  return {
    label,
    check: (value: unknown): value is Env =>
      isLabelledMessage(value) && isE(value),
    wrap:
      wrap ?? ((message: MessageOf<Env>): Env => ({ label, message } as Env)),
    unwrap: (envelope: Env): MessageOf<Env> => envelope.message,
  };
};
