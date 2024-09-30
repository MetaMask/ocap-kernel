import type { TypeGuard } from '@ocap/utils';

import { kernelTestCommand } from './kernel-test.js';
import { makeMessageKit } from './message-kit.js';

const clusterCommand = {
  ...kernelTestCommand,
};

const clusterCommandKit = makeMessageKit(clusterCommand);

export const ClusterCommandMethod = clusterCommandKit.methods;

export type ClusterCommand = typeof clusterCommandKit.send;
export const isClusterCommand: TypeGuard<ClusterCommand> =
  clusterCommandKit.sendGuard;
export type ClusterCommandFunction<Return> = ReturnType<
  typeof clusterCommandKit.sendFunction<Return>
>;

export type ClusterCommandReply = typeof clusterCommandKit.reply;
export const isClusterCommandReply: TypeGuard<ClusterCommandReply> =
  clusterCommandKit.replyGuard;
export type ClusterCommandReplyFunction<Return> = ReturnType<
  typeof clusterCommandKit.replyFunction<Return>
>;
