import { mergeDisjointRecords } from '@metamask/kernel-utils/merge-disjoint-records';
import type { Logger } from '@metamask/logger';

import { makeEvaluator } from './evaluator.ts';
import { CapabilitySpecMessage, UserMessage } from './messages.ts';
import type { State, Action, Observation } from './messages.ts';
import { makePrinter } from './printer.ts';
import { makePrompter } from './prompter.ts';
import { makeReader } from './reader.ts';
import { extractCapabilitySchemas } from '../../capabilities/capability.ts';
import { makeEnd } from '../../capabilities/end.ts';
import type {
  CapabilityRecord,
  Context,
  Objective,
  PrepareAttempt,
  PREP,
  Progress,
} from '../../types.ts';
import { ifDefined } from '../../utils.ts';

export const prepareAttempt: PrepareAttempt<State, Action, Observation> = <
  Result,
>({
  objective: { intent, judgment },
  context,
  options = {},
}: {
  objective: Objective<Result>;
  context: Context;
  options?: {
    taskLogger?: Logger;
    printLogger?: Logger;
  };
}): [PREP<State, Action, Observation>, Progress<Result, State>] => {
  const { taskLogger, printLogger } = options;

  const [end, didEnd, getEnd] = makeEnd();

  const capabilities = mergeDisjointRecords(context.capabilities, {
    end,
  }) as CapabilityRecord;

  const history = [
    new CapabilitySpecMessage(extractCapabilitySchemas(capabilities)),
    new UserMessage(intent),
  ];

  const progress: Progress<Result, State> = {
    history,
    isDone: () => {
      if (didEnd()) {
        const result = getEnd();
        if (!judgment(result)) {
          throw new Error(`Invalid result: ${result as string}`);
        }
        Object.assign(progress, { result });
        return true;
      }
      return false;
    },
    // result: not defined until judgment is satisfied
  };

  const readLogger = taskLogger?.subLogger({ tags: ['read'] });
  const evalLogger = taskLogger?.subLogger({ tags: ['eval'] });

  return [
    [
      makePrompter(),
      makeReader(ifDefined({ logger: readLogger })),
      makeEvaluator(ifDefined({ capabilities, logger: evalLogger })),
      makePrinter({ history, ...ifDefined({ logger: printLogger }) }),
      // TODO: Fix these types
    ] as unknown as PREP<State, Action, Observation>,
    progress,
  ];
};
