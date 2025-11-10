import { makeAgent } from '../agent.ts';
import type { Agent } from '../types.ts';
import type { State, Action, Observation } from './json/messages.ts';
import { prepareAttempt } from './json/prepare-attempt.ts';

export const makeJsonAgent = (
  args: Parameters<typeof makeAgent<State, Action, Observation>>[0],
): Agent => makeAgent<State, Action, Observation>(args, prepareAttempt);
