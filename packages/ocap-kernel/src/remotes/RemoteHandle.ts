import type { VatOneResolution } from '@agoric/swingset-liveslots';
import type { CapData } from '@endo/marshal';
import { makePromiseKit } from '@endo/promise-kit';
import { Logger } from '@metamask/logger';

import {
  performDropImports,
  performRetireImports,
  performExportCleanup,
} from '../garbage-collection/gc-handlers.ts';
import type { KernelQueue } from '../KernelQueue.ts';
import type { KernelStore } from '../store/index.ts';
import type {
  RemoteId,
  ERef,
  EndpointHandle,
  Message,
  CrankResults,
} from '../types.ts';
import type { RemoteComms } from './types.ts';

type RemoteHandleConstructorProps = {
  remoteId: RemoteId;
  peerId: string;
  kernelStore: KernelStore;
  kernelQueue: KernelQueue;
  remoteComms: RemoteComms;
  locationHints?: string[] | undefined;
  logger?: Logger | undefined;
};

type MessageDelivery = ['message', string, Message];
type NotifyDelivery = ['notify', VatOneResolution[]];
type DropExportsDelivery = ['dropExports', string[]];
type RetireExportsDelivery = ['retireExports', string[]];
type RetireImportsDelivery = ['retireImports', string[]];

type DeliveryParams =
  | MessageDelivery
  | NotifyDelivery
  | DropExportsDelivery
  | RetireExportsDelivery
  | RetireImportsDelivery;

type Delivery = {
  method: 'deliver';
  params: DeliveryParams;
};

type RedeemURLRequest = {
  method: 'redeemURL';
  params: [string, string];
};

type RedeemURLReply = {
  method: 'redeemURLReply';
  params: [boolean, string, string];
};

type RemoteCommand = Delivery | RedeemURLRequest | RedeemURLReply;

export class RemoteHandle implements EndpointHandle {
  /** The ID of the remote connection this is the RemoteHandle for. */
  readonly remoteId: RemoteId;

  /** The peer ID of the remote kernel this is connected to. */
  readonly #peerId: string;

  /** Storage holding the kernel's persistent state. */
  readonly #kernelStore: KernelStore;

  /** The kernel's queue */
  readonly #kernelQueue: KernelQueue;

  /** Connectivity to the network. */
  readonly #remoteComms: RemoteComms;

  /** Possible contact points for reaching the remote peer. */
  readonly #locationHints: string[];

  /** Flag that location hints need to be sent to remote comms object. */
  #needsHinting: boolean = true;

  /** Pending URL redemption requests that have not yet been responded to. */
  readonly #pendingRedemptions: Map<
    string,
    [(ref: string) => void, (problem: string | Error) => void]
  > = new Map();

  /** Generation counter for keys to match URL redemption replies to requests. */
  #redemptionCounter: number = 1;

  /** Crank result object to reuse (since it's always the same). */
  readonly #myCrankResult: CrankResults;

  /**
   * Construct a new RemoteHandle instance.
   *
   * @param params - Named constructor parameters.
   * @param params.remoteId - Our remote ID.
   * @param params.peerId - The libp2p peer ID for the remote end.
   * @param params.kernelStore - The kernel's persistent state store.
   * @param params.kernelQueue - The kernel's queue.
   * @param params.remoteComms - Remote comms object to access the network.
   * @param params.locationHints - Possible contact points to reach the other end.
   */
  // eslint-disable-next-line no-restricted-syntax
  private constructor({
    remoteId,
    peerId,
    kernelStore,
    kernelQueue,
    remoteComms,
    locationHints,
  }: RemoteHandleConstructorProps) {
    this.remoteId = remoteId;
    this.#peerId = peerId;
    this.#kernelStore = kernelStore;
    this.#kernelQueue = kernelQueue;
    this.#remoteComms = remoteComms;
    this.#locationHints = locationHints ?? [];
    this.#myCrankResult = { didDelivery: remoteId };
  }

  /**
   * Construct a new RemoteHandle instance.
   *
   * @param params - Named constructor parameters.
   * @param params.remoteId - Our remote ID.
   * @param params.peerId - The libp2p peer ID for the remote end.
   * @param params.kernelStore - The kernel's persistent state store.
   * @param params.kernelQueue - The kernel's queue.
   * @param params.remoteComms - Remote comms object to access the network.
   * @param params.logger - Optional logger for error and diagnostic output.
   *
   * @returns the new RemoteHandle instance.
   */
  static make(params: RemoteHandleConstructorProps): RemoteHandle {
    const remote = new RemoteHandle(params);
    return remote;
  }

  /**
   * Transmit a message to the remote end of the connection.
   *
   * @param message - The message to send.
   */
  async #sendRemoteCommand(message: RemoteCommand): Promise<void> {
    if (this.#needsHinting) {
      // Hints are registered lazily because (a) transmitting to the platform
      // services process has to be done asynchronously, which is very painful
      // to do at construction time, and (b) after a kernel restart (when we
      // might have a lot of known peers with hint information) connection
      // re-establishment will also be lazy, with a reasonable chance of never
      // even happening if we never talk to a particular peer again. Instead, we
      // wait until we know a given peer needs to be communicated with before
      // bothering to send its hint info.
      await this.#remoteComms.registerLocationHints(
        this.#peerId,
        this.#locationHints,
      );
      this.#needsHinting = false;
    }
    await this.#remoteComms.sendRemoteMessage(
      this.#peerId,
      JSON.stringify(message),
    );
  }

  /**
   * Send a 'message' delivery to the remote.
   *
   * @param target - The ref of the object to which the message is addressed.
   * @param message - The message to deliver.
   * @returns the crank results.
   */
  async deliverMessage(target: ERef, message: Message): Promise<CrankResults> {
    await this.#sendRemoteCommand({
      method: 'deliver',
      params: ['message', target, message],
    });
    return this.#myCrankResult;
  }

  /**
   * Send a 'notify' delivery to the remote.
   *
   * @param resolutions - One or more promise resolutions to deliver.
   * @returns the crank results.
   */
  async deliverNotify(resolutions: VatOneResolution[]): Promise<CrankResults> {
    await this.#sendRemoteCommand({
      method: 'deliver',
      params: ['notify', resolutions],
    });
    return this.#myCrankResult;
  }

  /**
   * Send a 'dropExports' delivery to the remote.
   *
   * @param erefs - The refs of the exports to be dropped.
   * @returns the crank results.
   */
  async deliverDropExports(erefs: ERef[]): Promise<CrankResults> {
    await this.#sendRemoteCommand({
      method: 'deliver',
      params: ['dropExports', erefs],
    });
    return this.#myCrankResult;
  }

  /**
   * Send a 'retireExports' delivery to the remote.
   *
   * @param erefs - The refs of the exports to be retired.
   * @returns the crank results.
   */
  async deliverRetireExports(erefs: ERef[]): Promise<CrankResults> {
    await this.#sendRemoteCommand({
      method: 'deliver',
      params: ['retireExports', erefs],
    });
    return this.#myCrankResult;
  }

  /**
   * Send a 'retireImports' delivery to the remote.
   *
   * @param erefs - The refs of the imports to be retired.
   * @returns the crank results.
   */
  async deliverRetireImports(erefs: ERef[]): Promise<CrankResults> {
    await this.#sendRemoteCommand({
      method: 'deliver',
      params: ['retireImports', erefs],
    });
    return this.#myCrankResult;
  }

  /**
   * Make a 'bringOutYourDead' delivery to the remote.
   *
   * Currently this does not actually do anything but is included to satisfy the
   * EndpointHandle interface.
   *
   * @returns the crank results.
   */
  async deliverBringOutYourDead(): Promise<CrankResults> {
    // XXX Currently a no-op, but probably some further DGC action is warranted here
    return this.#myCrankResult;
  }

  // Warning: The handling of the GC deliveries ('dropExports', 'retireExports',
  // and 'dropImports') is very confusing.
  //
  // For example, in the context of this RemoteHandle, 'dropExports' means the
  // RemoteHandle at the other end of the network was delivered a 'dropExports'
  // by *its* kernel, telling it that references which that RemoteHandle had
  // been exporting to its kernel are no longer referenced by that kernel. But
  // exports from the remote end to its kernel are imports from the local kernel
  // into this RemoteHandle (which is to say, this end had to import them from
  // the local kernel here in order to have them so they could be exported at
  // the other end). This in turn means that receiving a 'dropExports' message
  // over the network tells this RemoteHandle to stop importing the indicated
  // references. A vat in these circumstances would use a 'dropImports' syscall
  // to accomplish this, and we use the same code that underpins the
  // 'dropImports' syscall to do that job here.  But it's definitely confusing
  // that we use 'dropImports' code to implement 'dropExports'. Analogous
  // reasoning applies to the other GC deliveries:
  //
  //      DELIVERY | "SYSCALL"
  // --------------+--------------
  //   dropExports | dropImports
  // retireExports | retireImports
  // retireImports | retireExports

  /**
   * Handle a 'dropExports' delivery from the remote end.
   *
   * @param erefs - The refs of the exports to be dropped.
   */
  #dropExports(erefs: ERef[]): void {
    const krefs = erefs.map((ref) =>
      this.#kernelStore.translateRefEtoK(this.remoteId, ref),
    );
    performDropImports(krefs, this.remoteId, this.#kernelStore);
  }

  /**
   * Handle a 'retireExports' delivery from the remote end.
   *
   * @param erefs - The refs of the exports to be retired.
   */
  #retireExports(erefs: ERef[]): void {
    const krefs = erefs.map((ref) =>
      this.#kernelStore.translateRefEtoK(this.remoteId, ref),
    );
    performRetireImports(krefs, this.remoteId, this.#kernelStore);
  }

  /**
   * Handle a 'retireImports' delivery from the remote end.
   *
   * @param erefs - The refs of the imports to be retired.
   */
  #retireImports(erefs: ERef[]): void {
    const krefs = erefs.map((ref) =>
      this.#kernelStore.translateRefEtoK(this.remoteId, ref),
    );
    performExportCleanup(krefs, true, this.remoteId, this.#kernelStore);
  }

  /**
   * Handle a delivery from the remote end.
   *
   * @param params - the delivery params, which vary based on the kind of delivery.
   */
  #handleRemoteDeliver(params: DeliveryParams): void {
    const [method] = params;
    switch (method) {
      case 'message': {
        const [, target, message] = params;
        this.#kernelQueue.enqueueSend(
          this.#kernelStore.translateRefEtoK(this.remoteId, target),
          this.#kernelStore.translateMessageEtoK(this.remoteId, message),
        );
        break;
      }
      case 'notify': {
        const [, resolutions] = params;
        const kResolutions: VatOneResolution[] = resolutions.map(
          (resolution) => {
            const [rpid, rejected, data] = resolution;
            return [
              this.#kernelStore.translateRefEtoK(this.remoteId, rpid),
              rejected,
              this.#kernelStore.translateCapDataEtoK(
                this.remoteId,
                data as CapData<ERef>,
              ),
            ];
          },
        );
        this.#kernelQueue.resolvePromises(this.remoteId, kResolutions);
        break;
      }
      case 'dropExports': {
        const [, erefs] = params;
        this.#dropExports(erefs);
        break;
      }
      case 'retireExports': {
        const [, erefs] = params;
        this.#retireExports(erefs);
        break;
      }
      case 'retireImports': {
        const [, erefs] = params;
        this.#retireImports(erefs);
        break;
      }
      default:
        // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
        throw Error(`unknown remote delivery method ${method}`);
    }
  }

  /**
   * Handle an ocap URL redemption request from the remote end.
   *
   * @param url - The ocap URL attempting to be redeemed.
   * @param replyKey - A sender-provided tag to send with the reply.
   *
   * @returns a string containing the 'redeemURLReply' message to send back to the requester.
   */
  async #handleRedeemURLRequest(
    url: string,
    replyKey: string,
  ): Promise<string> {
    assert.typeof(replyKey, 'string');
    let kref: string;
    try {
      kref = await this.#remoteComms.redeemLocalOcapURL(url);
    } catch (error) {
      return JSON.stringify({
        method: 'redeemURLReply',
        params: [false, replyKey, `${(error as Error).message}`],
      });
    }
    const eref = this.#kernelStore.translateRefKtoE(this.remoteId, kref, true);
    return JSON.stringify({
      method: 'redeemURLReply',
      params: [true, replyKey, eref],
    });
  }

  /**
   * Handle an ocap URL redemption reply from the remote end.
   *
   * @param success - true if the result is a URL, false if the result is an error.
   * @param replyKey - that tag that was sent in the request being replied to.
   * @param result - if success, an object ref; if not, an error message string.
   */
  async #handleRedeemURLReply(
    success: boolean,
    replyKey: string,
    result: string,
  ): Promise<void> {
    const handlers = this.#pendingRedemptions.get(replyKey);
    if (!handlers) {
      throw Error(`unknown URL redemption reply key ${replyKey}`);
    }
    this.#pendingRedemptions.delete(replyKey);
    const [resolve, reject] = handlers;
    if (success) {
      resolve(this.#kernelStore.translateRefEtoK(this.remoteId, result));
    } else {
      reject(result);
    }
  }

  /**
   * Handle a communication received from the remote end.
   *
   * @param message - The message that was received.
   *
   * @returns a string containing a message to send back to the original message
   *   sender as a response. An empty string means no such message is to be sent.
   */
  async handleRemoteMessage(message: string): Promise<string> {
    const remoteCommand: RemoteCommand = JSON.parse(message);
    const { method, params } = remoteCommand;
    let result = '';
    switch (method) {
      case 'deliver':
        this.#handleRemoteDeliver(params);
        break;
      case 'redeemURL':
        result = await this.#handleRedeemURLRequest(...params);
        break;
      case 'redeemURLReply':
        await this.#handleRedeemURLReply(...params);
        break;
      default:
        // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
        throw Error(`unknown remote message type ${method}`);
    }
    return result;
  }

  /**
   * Obtain a reference to an object designated by an ocap URL.
   *
   * @param url - The ocap URL to be redeemed.
   *
   * @returns a promise for the kref of the object designated by `url`.
   */
  async redeemOcapURL(url: string): Promise<string> {
    const replyKey = `${this.#redemptionCounter}`;
    this.#redemptionCounter += 1;
    const { promise, resolve, reject } = makePromiseKit<string>();
    this.#pendingRedemptions.set(replyKey, [resolve, reject]);

    // Set up timeout handling with AbortSignal
    const timeoutSignal = AbortSignal.timeout(30_000);
    let abortHandler: (() => void) | undefined;
    const timeoutPromise = new Promise<never>((_resolve, _reject) => {
      abortHandler = () => {
        // Clean up from pending redemptions map
        if (this.#pendingRedemptions.has(replyKey)) {
          this.#pendingRedemptions.delete(replyKey);
        }
        _reject(new Error('URL redemption timed out after 30 seconds'));
      };
      timeoutSignal.addEventListener('abort', abortHandler);
    });

    try {
      await this.#sendRemoteCommand({
        method: 'redeemURL',
        params: [url, replyKey],
      });
      // Wait for reply with timeout protection
      return await Promise.race([promise, timeoutPromise]);
    } catch (error) {
      // Clean up and remove from map if still pending
      if (this.#pendingRedemptions.has(replyKey)) {
        this.#pendingRedemptions.delete(replyKey);
      }
      throw error;
    } finally {
      // Clean up event listener to prevent unhandled rejection if operation
      // completes before timeout
      if (abortHandler) {
        timeoutSignal.removeEventListener('abort', abortHandler);
      }
    }
  }

  /**
   * Reject all pending URL redemptions with the given error message.
   * Called when we give up on this remote connection.
   *
   * @param errorMessage - The error message to reject with.
   */
  rejectPendingRedemptions(errorMessage: string): void {
    const error = Error(errorMessage);
    for (const [, [, reject]] of this.#pendingRedemptions) {
      reject(error);
    }
    this.#pendingRedemptions.clear();
  }
}
