import { makePromiseKit } from '@endo/promise-kit';
import { makeCounter, stringify } from '@metamask/kernel-utils';
import type { PromiseCallbacks } from '@metamask/kernel-utils';
import { assert as assertStruct } from '@metamask/superstruct';
import { isJsonRpcFailure, isJsonRpcSuccess } from '@metamask/utils';
import type {
  JsonRpcNotification,
  JsonRpcRequest,
  JsonRpcSuccess,
} from '@metamask/utils';
import { Logger } from '@ocap/logger';

import type {
  MethodSpec,
  ExtractParams,
  ExtractResult,
  MethodSpecRecord,
  ExtractNotification,
  ExtractRequest,
} from './types.ts';

export type SendMessage = (
  payload: JsonRpcRequest | JsonRpcNotification,
) => Promise<void>;

export class RpcClient<
  // The class picks up its type from the `methods` argument,
  // so using `any` in this constraint is safe.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Methods extends MethodSpecRecord<MethodSpec<string, any, any>>,
> {
  readonly #methods: Methods;

  readonly #prefix: string;

  readonly #unresolvedMessages = new Map<string, PromiseCallbacks>();

  readonly #messageCounter = makeCounter();

  readonly #sendMessage: SendMessage;

  readonly #logger: Logger;

  constructor(
    methods: Methods,
    sendMessage: SendMessage,
    prefix: string,
    logger: Logger = new Logger('rpc-client'),
  ) {
    this.#methods = methods;
    this.#sendMessage = sendMessage;
    this.#prefix = prefix;
    this.#logger = logger;
  }

  async #call<Method extends ExtractRequest<Methods>>(
    method: Method,
    params: ExtractParams<Method, Methods>,
    id: string,
  ): Promise<ExtractResult<Method, Methods>> {
    const response = await this.#createMessage(id, {
      id,
      jsonrpc: '2.0',
      method,
      params,
    });

    this.#assertResult(method, response.result);
    return response.result;
  }

  /**
   * Calls a JSON-RPC method and returns the result.
   *
   * @param method - The method to call.
   * @param params - The parameters to pass to the method.
   * @returns A promise that resolves to the result.
   */
  async call<Method extends ExtractRequest<Methods>>(
    method: Method,
    params: ExtractParams<Method, Methods>,
  ): Promise<ExtractResult<Method, Methods>> {
    return await this.#call(method, params, this.#nextMessageId());
  }

  /**
   * Sends a JSON-RPC notification. Recall that we do not receive responses to notifications
   * for any reason.
   *
   * @param method - The method to notify.
   * @param params - The parameters to pass to the method.
   */
  async notify<Method extends ExtractNotification<Methods>>(
    method: Method,
    params: ExtractParams<Method, Methods>,
  ): Promise<void> {
    await this.#sendMessage({
      jsonrpc: '2.0',
      method,
      params,
    }).catch((error) =>
      this.#logger.error(`Failed to send notification`, error),
    );
  }

  /**
   * Calls a JSON-RPC method and returns the message id and the result.
   *
   * @param method - The method to call.
   * @param params - The parameters to pass to the method.
   * @returns A promise that resolves to a tuple of the message id and the result.
   */
  async callAndGetId<Method extends ExtractRequest<Methods>>(
    method: Method,
    params: ExtractParams<Method, Methods>,
  ): Promise<[string, ExtractResult<Method, Methods>]> {
    const id = this.#nextMessageId();
    return [id, await this.#call(method, params, id)];
  }

  #assertResult<Method extends ExtractRequest<Methods>>(
    method: Method,
    result: unknown,
  ): asserts result is ExtractResult<Method, Methods> {
    try {
      // @ts-expect-error: For unknown reasons, TypeScript fails to recognize that
      // `Method` must be a key of `this.#methods`.
      assertStruct(result, this.#methods[method].result);
    } catch (error) {
      throw new Error(`Invalid result: ${(error as Error).message}`);
    }
  }

  async #createMessage(
    messageId: string,
    payload: JsonRpcRequest,
  ): Promise<JsonRpcSuccess> {
    const { promise, reject, resolve } = makePromiseKit<JsonRpcSuccess>();

    this.#unresolvedMessages.set(messageId, {
      resolve: resolve as (value: unknown) => void,
      reject,
    });

    await this.#sendMessage(payload);
    return promise;
  }

  /**
   * Handles a JSON-RPC response to a previously made method call.
   *
   * @param messageId - The id of the message to handle.
   * @param response - The response to handle.
   */
  handleResponse(messageId: string, response: unknown): void {
    const requestCallbacks = this.#unresolvedMessages.get(messageId);
    if (requestCallbacks === undefined) {
      this.#logger.debug(
        `Received response with unexpected id "${messageId}".`,
      );
    } else {
      this.#unresolvedMessages.delete(messageId);
      if (isJsonRpcSuccess(response)) {
        requestCallbacks.resolve(response);
      } else if (isJsonRpcFailure(response)) {
        requestCallbacks.reject(response.error);
      } else {
        requestCallbacks.reject(
          new Error(`Invalid JSON-RPC response: ${stringify(response)}`),
        );
      }
    }
  }

  /**
   * Rejects all unresolved messages with an error.
   *
   * @param error - The error to reject the messages with.
   */
  rejectAll(error: Error): void {
    for (const [messageId, promiseCallback] of this.#unresolvedMessages) {
      promiseCallback?.reject(error);
      this.#unresolvedMessages.delete(messageId);
    }
  }

  #nextMessageId(): string {
    return `${this.#prefix}${this.#messageCounter()}`;
  }
}
