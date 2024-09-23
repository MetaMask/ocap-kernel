import type { StreamPair } from '@ocap/streams';
import { makeConnectionStreamPair } from '@ocap/streams';

import {
  makeBackgroundOffscreenConnection,
  makeOffscreenBackgroundConnection,
} from './extension-connections.js';
import type { CommandMessage, ExtensionMessageTarget } from './message.js';

export const makeBackgroundOffscreenStreamPair = (): StreamPair<
  CommandMessage<ExtensionMessageTarget.Offscreen>,
  CommandMessage<ExtensionMessageTarget.Background>
> => {
  const connection = makeBackgroundOffscreenConnection();
  return makeConnectionStreamPair(connection);
};

export const makeOffscreenBackgroundStreamPair = (): StreamPair<
  CommandMessage<ExtensionMessageTarget.Background>,
  CommandMessage<ExtensionMessageTarget.Offscreen>
> => {
  const connection = makeOffscreenBackgroundConnection();
  return makeConnectionStreamPair(connection);
};
