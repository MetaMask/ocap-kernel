import type { TypeGuard } from '@ocap/utils';

import { kernelCommand } from './kernel.js';
import { makeMessageKit } from './message-kit.js';

const clusterCommand = {
  ...kernelCommand,
};

const clusterCommandKit = makeMessageKit(clusterCommand);

export const ClusterCommandMethod = clusterCommandKit.methods;

export type ClusterCommand = typeof clusterCommandKit.send;
export const isClusterCommand: TypeGuard<ClusterCommand> =
  clusterCommandKit.sendGuard;

export type ClusterCommandReply = typeof clusterCommandKit.reply;
export const isClusterCommandReply: TypeGuard<ClusterCommandReply> =
  clusterCommandKit.replyGuard;
