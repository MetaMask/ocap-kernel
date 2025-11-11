import type { Logger } from '@metamask/logger';

import type { Message, MessageTypeBase } from './messages.ts';
import type { Context, Experience, Objective } from './task.ts';

export type Agent = {
  task: <Result>(
    intent: string,
    judgment?: (result: unknown) => result is Result,
    options?: { invocationBudget?: number; logger?: Logger },
  ) => Promise<Result>;
  get experiences(): AsyncIterable<Experience>;
};

export type SampleCollector<Result = unknown> = (
  delta: string,
) => Result | null;

export type Prompter<State extends Message<MessageTypeBase>[]> = (
  state: State,
) => {
  prompt: string;
  readerArgs?: Record<string, unknown>;
};

export type Reader<Action extends Message<MessageTypeBase>> = (args: {
  // This can be threaded with the stream type from the language model.
  stream: AsyncIterable<{ response: string }>;
  abort: () => Promise<void>;
}) => Promise<Action>;

export type Evaluator<
  State extends Message<MessageTypeBase>[],
  Action extends Message<MessageTypeBase>,
  Observation extends Message<MessageTypeBase>,
> = (state: State, action: Action) => Promise<Observation | null>;

export type Printer<
  Action extends Message<MessageTypeBase>,
  Observation extends Message<MessageTypeBase>,
> = (action: Action, observation: Observation | null) => void;

export type PREP<
  State extends Message<MessageTypeBase>[],
  Action extends Message<MessageTypeBase>,
  Observation extends Message<MessageTypeBase>,
> = [
  Prompter<State>,
  Reader<Action>,
  Evaluator<State, Action, Observation>,
  Printer<Action, Observation>,
];

export type Progress<Result, History extends Message<MessageTypeBase>[]> = {
  history: History;
  isDone: () => boolean;
  result?: Result;
};

export type PrepareAttempt<
  // The agent's environment.
  State extends Message<MessageTypeBase>[],
  Action extends Message<MessageTypeBase>,
  Observation extends Message<MessageTypeBase>,
  // The user's expectation.
> = <Result>(args: {
  objective: Objective<Result>;
  context: Context;
  options?: {
    taskLogger?: Logger;
    printLogger?: Logger;
  };
}) => [PREP<State, Action, Observation>, Progress<Result, State>];
