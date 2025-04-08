import { makePromiseKit } from '@endo/promise-kit';
import { assert as assertStruct } from '@metamask/superstruct';
import { isJsonRpcFailure, isJsonRpcSuccess } from '@metamask/utils';
import type { JsonRpcRequest, JsonRpcSuccess } from '@metamask/utils';
import { makeCounter, stringify } from '@ocap/utils';
import type { PromiseCallbacks } from '@ocap/utils';

import type {
  MethodSpec,
  ExtractParams,
  ExtractResult,
  ExtractMethod,
  MethodSpecRecord,
} from './types.ts';

export type SendMessage = (payload: JsonRpcRequest) => Promise<void>;

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

  constructor(methods: Methods, sendMessage: SendMessage, prefix: string) {
    this.#methods = methods;
    this.#sendMessage = sendMessage;
    this.#prefix = prefix;
  }

  async call<Method extends ExtractMethod<Methods>>(
    method: Method,
    params: ExtractParams<Method, Methods>,
  ): Promise<ExtractResult<Method, Methods>> {
    const id = this.#nextMessageId();
    const response = await this.#createMessage(id, {
      id,
      jsonrpc: '2.0',
      method,
      params,
    });

    this.#assertResult(method, response.result);
    return response.result;
  }

  #assertResult<Method extends ExtractMethod<Methods>>(
    method: Method,
    result: unknown,
  ): asserts result is ExtractResult<Method, Methods> {
    try {
      // @ts-expect-error - TODO: For unknown reasons, TypeScript fails to recognize that
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

  handleResponse(messageId: string, response: unknown): void {
    const requestCallbacks = this.#unresolvedMessages.get(messageId);
    if (requestCallbacks === undefined) {
      console.error(`No unresolved message with id "${messageId}".`);
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

  rejectAll(error: Error): void {
    for (const [messageId, promiseCallback] of this.#unresolvedMessages) {
      promiseCallback?.reject(error);
      this.#unresolvedMessages.delete(messageId);
    }
  }

  #nextMessageId(): string {
    return `${this.#prefix}:${this.#messageCounter()}`;
  }
}
