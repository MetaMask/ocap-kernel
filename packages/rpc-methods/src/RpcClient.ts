import { makePromiseKit } from '@endo/promise-kit';
import type { Struct } from '@metamask/superstruct';
import { assert as assertStruct } from '@metamask/superstruct';
import { assertIsJsonRpcResponse, isJsonRpcFailure } from '@metamask/utils';
import type { Json, JsonRpcParams } from '@metamask/utils';
import { makeCounter } from '@ocap/utils';
import type { PromiseCallbacks } from '@ocap/utils';

export type MethodSignature<
  Method extends string,
  Params extends JsonRpcParams,
  Result extends Json,
> = (method: Method, params: Params) => Promise<Result>;

type ExtractMethodName<
  Methods extends MethodSignature<string, JsonRpcParams, Json>,
> = Methods extends (
  method: infer Method,
  params: JsonRpcParams,
) => Promise<Json>
  ? Method
  : never;

type ExtractParams<
  Methods extends MethodSignature<string, JsonRpcParams, Json>,
> = Methods extends (method: string, params: infer Params) => Promise<Json>
  ? Params
  : never;

type ExtractResult<
  Methods extends MethodSignature<string, JsonRpcParams, Json>,
> = Methods extends (
  method: string,
  params: JsonRpcParams,
) => Promise<infer Result>
  ? Result
  : never;

export type MethodSpec<Method extends string, Result extends Json> = {
  method: Method;
  result: Struct<Result>;
};

type MethodSpecs<Methods extends MethodSignature<string, JsonRpcParams, Json>> =
  Record<
    ExtractMethodName<Methods>,
    MethodSpec<ExtractMethodName<Methods>, ExtractResult<Methods>>
  >;

type RpcPayload = {
  method: string;
  params: JsonRpcParams;
};

type SendMessage = (messageId: string, payload: RpcPayload) => Promise<void>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export class RpcClient<Methods extends MethodSignature<string, any, any>> {
  readonly #methods: MethodSpecs<Methods>;

  readonly #prefix: string;

  readonly #unresolvedMessages = new Map<string, PromiseCallbacks>();

  readonly #messageCounter = makeCounter();

  readonly #sendMessage: SendMessage;

  constructor(
    methods: MethodSpecs<Methods>,
    sendMessage: SendMessage,
    prefix: string,
  ) {
    this.#methods = methods;
    this.#sendMessage = sendMessage;
    this.#prefix = prefix;
  }

  async call<Method extends Methods>(
    method: ExtractMethodName<Method>,
    params: ExtractParams<Method>,
  ): Promise<ExtractResult<Method>> {
    const response = await this.#createMessage({
      method,
      params,
    });
    assertIsJsonRpcResponse(response);

    if (isJsonRpcFailure(response)) {
      throw new Error(`${response.error.message}`);
    }

    assertResult(response.result, this.#methods[method].result);
    return response.result;
  }

  async #createMessage(payload: RpcPayload): Promise<unknown> {
    const { promise, reject, resolve } = makePromiseKit<unknown>();
    const messageId = this.#nextMessageId();

    this.#unresolvedMessages.set(messageId, {
      resolve: resolve as (value: unknown) => void,
      reject,
    });

    await this.#sendMessage(messageId, payload);
    return promise;
  }

  handleResponse(messageId: string, value: unknown): void {
    const promiseCallbacks = this.#unresolvedMessages.get(messageId);
    if (promiseCallbacks === undefined) {
      console.error(`No unresolved message with id "${messageId}".`);
    } else {
      this.#unresolvedMessages.delete(messageId);
      promiseCallbacks.resolve(value);
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

/**
 * @param result - The result to assert.
 * @param struct - The struct to assert the result against.
 * @throws If the result is invalid.
 */
function assertResult<Result extends Json>(
  result: unknown,
  struct: Struct<Result>,
): asserts result is Result {
  try {
    assertStruct(result, struct);
  } catch (error) {
    throw new Error(`Invalid result: ${(error as Error).message}`);
  }
}
