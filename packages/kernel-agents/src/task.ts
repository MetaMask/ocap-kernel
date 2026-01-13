import { makeCounter } from '@metamask/kernel-utils';

import type { Task, CapabilityRecord } from './types.ts';

/**
 * A trivial judgment that always returns true.
 *
 * @param _result - The result to judge.
 * @returns True.
 */
export const defaultJudgment = <Result>(_result: unknown): _result is Result =>
  true;

const formatTaskId = (count: number): string =>
  `t${count.toString().padStart(3, '0')}`;

/**
 * Manages the creation and tracking of tasks for agents.
 */
export class TaskManager<ResultBase = unknown> {
  readonly #tasks: Task<ResultBase>[] = [];

  readonly #taskCounter = makeCounter();

  /**
   * Specify a task.
   *
   * @param args - The arguments to specify the task.
   * @param args.intent - A specification of the task to be performed, or a query to be answered.
   * @param args.judgment - The function to determine if the task is complete.
   * @param args.capabilities - The capabilities available to the task - revocable.
   * @param args.knowledge - The knowledge available to the task - irrevocable.
   * @returns A task.
   */
  makeTask<Result extends ResultBase = ResultBase>({
    intent,
    judgment = defaultJudgment<Result>,
    capabilities = {},
    knowledge = {},
  }: {
    intent: string;
    judgment?: (result: unknown) => result is Result;
    capabilities?: CapabilityRecord;
    knowledge?: Record<string, unknown>;
  }): Task<Result> {
    const task: Task<Result> = {
      id: formatTaskId(this.#taskCounter()),
      objective: { intent, judgment },
      context: { knowledge, capabilities },
      attempts: [],
    };
    this.#tasks.push(task);
    return task;
  }

  /**
   * Get the tasks managed by the task manager.
   *
   * @returns The tasks.
   */
  get tasks(): Task<ResultBase>[] {
    return [...this.#tasks];
  }
}
