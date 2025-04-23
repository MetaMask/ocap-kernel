import { isJsonRpcRequest, isJsonRpcResponse } from '@metamask/utils';
import type { JsonRpcResponse } from '@metamask/utils';
import type { Logger } from '@ocap/logger';
import { PostMessageDuplexStream } from '@ocap/streams/browser';
import { stringify } from '@ocap/utils';
import type { JsonRpcCall } from '@ocap/utils';
import { nanoid } from 'nanoid';

import { isUiControlCommand } from './ui-control-command.ts';
import type { UiControlCommand } from './ui-control-command.ts';

export const UI_CONTROL_CHANNEL_NAME = 'ui-control';

export type KernelControlStream = PostMessageDuplexStream<
  JsonRpcCall,
  JsonRpcResponse
>;

export type KernelControlReplyStream = PostMessageDuplexStream<
  JsonRpcResponse,
  JsonRpcCall
>;

type HandleInstanceMessage = (request: JsonRpcCall) => Promise<JsonRpcResponse>;

/**
 * Establishes a connection between a UI instance and the kernel. Should be called
 * exactly once per UI instance, during initialization.
 *
 * @param logger - The logger instance.
 * @returns The kernel control reply stream.
 */
export const establishKernelConnection = async (
  logger: Logger,
): Promise<KernelControlReplyStream> => {
  const uiControlChannel = new BroadcastChannel(UI_CONTROL_CHANNEL_NAME);
  const instanceChannelName = `ui-instance-${nanoid()}`;
  const instanceChannel = new BroadcastChannel(instanceChannelName);

  uiControlChannel.postMessage({
    method: 'init',
    params: instanceChannelName,
  } as UiControlCommand);

  const kernelStream = await PostMessageDuplexStream.make<
    JsonRpcResponse,
    JsonRpcCall
  >({
    validateInput: isJsonRpcResponse,
    messageTarget: instanceChannel,
    onEnd: () => {
      instanceChannel.close();
    },
  });

  instanceChannel.onmessageerror = (event) => {
    logger.error(`UI instance channel error: ${stringify(event.data)}`);
    kernelStream
      .throw(new Error(stringify(event.data)))
      .catch(/* istanbul ignore next */ () => undefined);
    instanceChannel.close();
  };

  uiControlChannel.onmessageerror = (event) => {
    logger.error(`UI control channel error: ${stringify(event.data)}`);
  };

  return kernelStream;
};

const connectToNextUiInstance = async (
  channelName: string,
): Promise<KernelControlStream> => {
  const instanceChannel = new BroadcastChannel(channelName);
  const instanceStream: KernelControlStream =
    await PostMessageDuplexStream.make({
      validateInput: isJsonRpcRequest,
      messageTarget: instanceChannel,
      onEnd: () => {
        instanceChannel.close();
      },
    });

  instanceChannel.onmessageerror = (event) => {
    instanceStream
      .throw(new Error(stringify(event.data)))
      .catch(/* istanbul ignore next */ () => undefined);
  };

  return instanceStream;
};

/**
 * Establishes a connection between the kernel and a UI instance. Should be called
 * exactly once in the kernel, during initialization, before any UI instances have
 * been created.
 *
 * @param handleInstanceMessage - The function to handle the instance message.
 * @param logger - The logger instance.
 */
export const receiveUiConnections = (
  handleInstanceMessage: HandleInstanceMessage,
  logger: Logger,
): void => {
  const seenChannels = new Set<string>();
  new BroadcastChannel(UI_CONTROL_CHANNEL_NAME).onmessage = (event) => {
    if (!isUiControlCommand(event.data)) {
      logger.error(
        `Received invalid UI control command: ${stringify(event.data)}`,
      );
      return;
    }

    const { params: channelName } = event.data;
    if (seenChannels.has(channelName)) {
      logger.error(`Already connected to UI instance "${channelName}"`);
      return;
    }
    seenChannels.add(channelName);

    logger.debug(`Connecting to UI instance "${channelName}"`);
    connectToNextUiInstance(channelName)
      .then(async (instanceStream) => {
        return instanceStream.drain(async (message) => {
          const reply = await handleInstanceMessage(message);
          await instanceStream.write(reply);
        });
      })
      .catch((error) => {
        logger.error(
          `Error handling message from UI instance "${channelName}":`,
          error,
        );
      })
      .finally(() => {
        logger.debug(`Closed connection to UI instance "${channelName}"`);
      });
  };
};
