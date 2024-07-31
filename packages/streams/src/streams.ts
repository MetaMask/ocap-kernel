import { makePromiseKit } from '@endo/promise-kit';
import type { Reader, Writer } from '@endo/stream';

type Resolve = (value: unknown) => void;

export class MessagePortReader<Yield> implements Reader<Yield> {
  #port: MessagePort;

  #messageQueue: MessageEvent[];

  #resolveQueue: Resolve[];

  constructor(port: MessagePort) {
    this.#port = port;
    this.#messageQueue = [];
    this.#resolveQueue = [];

    // Assigning to the `onmessage` property initializes the port's message queue.
    this.#port.onmessage = this.#handleMessage.bind(this);
  }

  [Symbol.asyncIterator]() {
    return this;
  }

  #handleMessage(message: MessageEvent): void {
    if (this.#resolveQueue.length > 0) {
      const resolve = this.#resolveQueue.shift() as Resolve;
      resolve({ done: false, value: message.data });
    } else {
      this.#messageQueue.push(message);
    }
  }

  async next(_value: never): Promise<IteratorResult<Yield, undefined>> {
    const { promise, resolve } = makePromiseKit();
    if (this.#messageQueue.length > 0) {
      const message = this.#messageQueue.shift() as MessageEvent;
      resolve({ done: false, value: message.data });
    } else {
      this.#resolveQueue.push(resolve);
    }
    return promise as Promise<IteratorResult<Yield, undefined>>;
  }

  async return(_value: never): Promise<IteratorResult<Yield, undefined>> {
    return this.#teardown();
  }

  async throw(_error: never): Promise<IteratorResult<Yield, undefined>> {
    return this.#teardown();
  }

  #teardown(): IteratorResult<Yield, undefined> {
    this.#port.close();
    this.#port.onmessage = null;
    return { done: true, value: undefined };
  }
}

export class MessagePortWriter<Yield> implements Writer<Yield> {
  #port: MessagePort;

  constructor(port: MessagePort) {
    this.#port = port;
  }

  [Symbol.asyncIterator]() {
    return this;
  }

  async next(value: Yield): Promise<IteratorResult<undefined, undefined>> {
    this.#port.postMessage(value);
    return { done: false, value: undefined };
  }

  async return(_value: never): Promise<IteratorResult<undefined, undefined>> {
    return this.#teardown();
  }

  async throw(error: Error): Promise<IteratorResult<undefined, undefined>> {
    return this.#teardown(error);
  }

  #teardown(error?: Error): IteratorResult<undefined, undefined> {
    if (error !== undefined) {
      this.#port.dispatchEvent(new ErrorEvent(error.message));
    }
    this.#port.close();
    return { done: true, value: undefined };
  }
}
