import type { StreamPair } from '@ocap/streams';
import { makeConnectionStreamPair } from '@ocap/streams';
import type { Command, CommandReply } from '@ocap/utils';

import {
  makeBackgroundOffscreenConnection,
  makeOffscreenBackgroundConnection,
} from './extension-connections.js';

export const makeBackgroundOffscreenStreamPair = (): StreamPair<
  CommandReply,
  Command
> => {
  const connection = makeBackgroundOffscreenConnection();
  return makeConnectionStreamPair(connection);
};

export const makeOffscreenBackgroundStreamPair = (): StreamPair<
  Command,
  CommandReply
> => {
  const connection = makeOffscreenBackgroundConnection();
  return makeConnectionStreamPair(connection);
};
