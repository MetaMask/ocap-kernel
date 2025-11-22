import type { Logger } from '@metamask/logger';

import type { CapabilityRecord } from './capability.ts';
import type { Message, MessageTypeBase, Transcript } from './messages.ts';

export type Task<Result> = {
  id: string;
  objective: Objective<Result>;
  context: Context;
  attempts: Attempt<Result, MessageTypeBase, MessageTypeBase>[];
};

/**
 * A specification of what a user wants from an agent.
 */
export type Objective<Result> = {
  intent: string;
  // For wonky cases, this criterion can be satisfied by assignment.
  judgment: (result: unknown) => result is Result;
};

/**
 * A specification of the context in which an agent is operating.
 */
export type Context = {
  capabilities: CapabilityRecord;
  knowledge?: Record<string, unknown>;
};

/**
 * An experience of an agent fulfilling an objective in a particular context.
 */
export type Experience = {
  objective: Objective<unknown>;
  context: Context;
  history: Message<MessageTypeBase>[];
} & (
  | {
      result?: unknown;
      error?: never;
    }
  | {
      result?: never;
      error?: Error;
    }
);

/**
 * An attempt by an agent to fulfill an objective in a particular context.
 * Organized for the agent's learning process.
 */
export type Attempt<
  Result,
  Action extends string,
  Observation extends string,
> = {
  history: Transcript<Action | Observation>;
} & (
  | {
      result?: Result;
      error?: never;
    }
  | {
      result?: never;
      error?: Error;
    }
);

export type TaskArgs = {
  logger?: Logger;
  seed?: number;
  invocationBudget?: number;
  capabilities?: CapabilityRecord;
  nAttempts?: number;
};
