import type { VatOneResolution } from '@agoric/swingset-liveslots';
import type { CapData } from '@endo/marshal';
import { makePromiseKit } from '@endo/promise-kit';
import { Logger } from '@metamask/logger';

import {
  performDropImports,
  performRetireImports,
  performExportCleanup,
} from '../../garbage-collection/gc-handlers.ts';
import type { KernelQueue } from '../../KernelQueue.ts';
import type { KernelStore } from '../../store/index.ts';
import type {
  RemoteId,
  ERef,
  EndpointHandle,
  Message,
  CrankResults,
} from '../../types.ts';
import type { RemoteComms } from '../types.ts';

/** How long to wait for ACK before retransmitting (ms). */
const ACK_TIMEOUT_MS = 10_000;

/** How long to wait before sending a standalone ACK if no outgoing traffic (ms). */
const DELAYED_ACK_MS = 50;

/** Maximum retransmission attempts before giving up. */
const MAX_RETRIES = 3;

/** Maximum number of pending messages awaiting ACK. */
const MAX_PENDING_MESSAGES = 200;

type RemoteHandleConstructorProps = {
  remoteId: RemoteId;
  peerId: string;
  kernelStore: KernelStore;
  kernelQueue: KernelQueue;
  remoteComms: RemoteComms;
  locationHints?: string[] | undefined;
  logger?: Logger | undefined;
  onGiveUp?: ((peerId: string) => void) | undefined;
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

export type RemoteMessageBase = Delivery | RedeemURLRequest | RedeemURLReply;

type RemoteCommand = {
  seq: number;
  ack?: number;
} & RemoteMessageBase;

/**
 * Handles communication with a remote kernel endpoint over the network.
 */
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

  /** Logger for diagnostic output. */
  readonly #logger: Logger;

  // --- Sequence/ACK tracking state ---

  /** Next sequence number to assign to outgoing messages. */
  #nextSendSeq: number = 0;

  /** Highest sequence number received from remote (for piggyback ACK). */
  #highestReceivedSeq: number = 0;

  /** Sequence number of first message in pending queue. */
  #startSeq: number = 0;

  /** Retry count for pending messages (reset on ACK). */
  #retryCount: number = 0;

  /** Timer handle for ACK timeout (retransmission). */
  #ackTimeoutHandle: ReturnType<typeof setTimeout> | undefined;

  /** Timer handle for delayed ACK (standalone ACK when no outgoing traffic). */
  #delayedAckHandle: ReturnType<typeof setTimeout> | undefined;

  /** Callback invoked when we give up on this remote (for promise rejection). */
  readonly #onGiveUp: ((peerId: string) => void) | undefined;

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
   * @param params.logger - Optional logger for diagnostic output.
   * @param params.onGiveUp - Optional callback when we give up on this remote.
   */
  // eslint-disable-next-line no-restricted-syntax
  private constructor({
    remoteId,
    peerId,
    kernelStore,
    kernelQueue,
    remoteComms,
    locationHints,
    logger,
    onGiveUp,
  }: RemoteHandleConstructorProps) {
    this.remoteId = remoteId;
    this.#peerId = peerId;
    this.#kernelStore = kernelStore;
    this.#kernelQueue = kernelQueue;
    this.#remoteComms = remoteComms;
    this.#locationHints = locationHints ?? [];
    this.#myCrankResult = { didDelivery: remoteId };
    this.#logger = logger ?? new Logger(`RemoteHandle:${peerId.slice(0, 8)}`);
    this.#onGiveUp = onGiveUp;
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
   * @param params.onGiveUp - Optional callback invoked when we give up on this remote.
   *
   * @returns the new RemoteHandle instance.
   */
  static make(params: RemoteHandleConstructorProps): RemoteHandle {
    const remote = new RemoteHandle(params);
    remote.#restorePersistedState();
    return remote;
  }

  /**
   * Restore persisted state from storage on startup.
   */
  #restorePersistedState(): void {
    const seqState = this.#kernelStore.getRemoteSeqState(this.remoteId);

    if (!seqState) {
      // No persisted seq state. Check for crash during first message enqueue:
      // Message may have been written but no seq state persisted yet.
      // First message always has seq 1 (since #nextSendSeq starts at 0, +1 = 1)
      if (this.#kernelStore.getPendingMessage(this.remoteId, 1)) {
        // Found orphan message - recover by setting up state
        this.#startSeq = 1;
        this.#nextSendSeq = 1;
        this.#kernelStore.setRemoteStartSeq(this.remoteId, 1);
        this.#kernelStore.setRemoteNextSendSeq(this.remoteId, 1);
        this.#logger.log(
          `${this.#peerId.slice(0, 8)}:: recovered orphan message at seq 1 from crash during first enqueue`,
        );
        this.#startAckTimeout();
      }
      return;
    }

    // Restore sequence state
    this.#highestReceivedSeq = seqState.highestReceivedSeq;
    this.#startSeq = seqState.startSeq;
    this.#nextSendSeq = seqState.nextSendSeq;

    // Check for crash during enqueue: message written but nextSendSeq not updated
    if (
      this.#kernelStore.getPendingMessage(this.remoteId, this.#nextSendSeq + 1)
    ) {
      this.#nextSendSeq += 1;
      this.#kernelStore.setRemoteNextSendSeq(this.remoteId, this.#nextSendSeq);
    }

    // Clean up orphan messages (seq < startSeq) left behind by crashes during ACK
    const orphansDeleted = this.#kernelStore.cleanupOrphanMessages(
      this.remoteId,
      this.#startSeq,
    );
    if (orphansDeleted > 0) {
      this.#logger.log(
        `${this.#peerId.slice(0, 8)}:: cleaned up ${orphansDeleted} orphan message(s) during recovery`,
      );
    }

    // If we have pending messages after recovery, start ACK timeout for retransmission
    if (this.#hasPendingMessages()) {
      this.#logger.log(
        `${this.#peerId.slice(0, 8)}:: restored ${this.#getPendingCount()} pending messages from persistence`,
      );
      this.#startAckTimeout();
    }
  }

  // --- Sequence/ACK management methods ---

  /**
   * Check if there are pending messages awaiting ACK.
   *
   * @returns True if there are pending messages.
   */
  #hasPendingMessages(): boolean {
    return this.#nextSendSeq > 0 && this.#startSeq <= this.#nextSendSeq;
  }

  /**
   * Get the number of pending messages awaiting ACK.
   *
   * @returns The count of pending messages.
   */
  #getPendingCount(): number {
    if (!this.#hasPendingMessages()) {
      return 0;
    }
    return this.#nextSendSeq - this.#startSeq + 1;
  }

  /**
   * Get the next sequence number and increment the counter.
   *
   * @returns The sequence number to use for the next outgoing message.
   */
  #getNextSeq(): number {
    this.#nextSendSeq += 1;
    return this.#nextSendSeq;
  }

  /**
   * Get the current ACK value (highest received sequence number).
   *
   * @returns The ACK value, or undefined if no messages received yet.
   */
  #getAckValue(): number | undefined {
    return this.#highestReceivedSeq > 0 ? this.#highestReceivedSeq : undefined;
  }

  /**
   * Process an incoming ACK (cumulative - acknowledges all messages up to ackSeq).
   * Uses crash-safe ordering: update startSeq first, then delete acked messages.
   *
   * @param ackSeq - The highest sequence number being acknowledged.
   */
  #handleAck(ackSeq: number): void {
    const seqsToDelete: number[] = [];
    const originalStartSeq = this.#startSeq;

    while (this.#startSeq <= ackSeq && this.#hasPendingMessages()) {
      seqsToDelete.push(this.#startSeq);
      this.#logger.log(
        `${this.#peerId.slice(0, 8)}:: message ${this.#startSeq} acknowledged`,
      );
      this.#startSeq += 1;
    }

    // Crash-safe dequeue: persist updated startSeq first, then delete messages
    // On crash recovery, orphan entries (seq < startSeq) will be cleaned lazily
    if (this.#startSeq !== originalStartSeq) {
      this.#kernelStore.setRemoteStartSeq(this.remoteId, this.#startSeq);
      for (const seq of seqsToDelete) {
        this.#kernelStore.deletePendingMessage(this.remoteId, seq);
      }
      // Reset retry count when messages are acknowledged
      this.#retryCount = 0;
    }

    // Restart or clear ACK timeout based on remaining pending messages
    this.#startAckTimeout();
  }

  /**
   * Start or restart the ACK timeout. If there are pending messages,
   * starts a timer. If the queue is empty, clears any existing timer.
   */
  #startAckTimeout(): void {
    this.#clearAckTimeout();
    if (this.#hasPendingMessages()) {
      this.#ackTimeoutHandle = setTimeout(() => {
        this.#handleAckTimeout();
      }, ACK_TIMEOUT_MS);
    }
  }

  /**
   * Clear the ACK timeout timer.
   */
  #clearAckTimeout(): void {
    if (this.#ackTimeoutHandle) {
      clearTimeout(this.#ackTimeoutHandle);
      this.#ackTimeoutHandle = undefined;
    }
  }

  /**
   * Handle ACK timeout - either retransmit or give up.
   */
  #handleAckTimeout(): void {
    this.#ackTimeoutHandle = undefined;
    if (!this.#hasPendingMessages()) {
      return;
    }

    if (this.#retryCount >= MAX_RETRIES) {
      // Give up - reject all pending messages, URL redemptions, and notify RemoteManager
      this.#logger.log(
        `${this.#peerId.slice(0, 8)}:: gave up after ${MAX_RETRIES} retries, rejecting ${this.#getPendingCount()} pending messages`,
      );
      this.#rejectAllPending(`not acknowledged after ${MAX_RETRIES} retries`);
      this.rejectPendingRedemptions(
        `Remote connection lost after ${MAX_RETRIES} failed retries`,
      );
      this.#onGiveUp?.(this.#peerId);
      return;
    }

    // Retransmit
    this.#retryCount += 1;
    this.#logger.log(
      `${this.#peerId.slice(0, 8)}:: retransmitting ${this.#getPendingCount()} pending messages (attempt ${this.#retryCount + 1})`,
    );
    this.#retransmitPending();
  }

  /**
   * Retransmit all pending messages.
   */
  #retransmitPending(): void {
    for (let seq = this.#startSeq; seq <= this.#nextSendSeq; seq += 1) {
      const messageString = this.#kernelStore.getPendingMessage(
        this.remoteId,
        seq,
      );
      if (messageString) {
        this.#remoteComms
          .sendRemoteMessage(this.#peerId, messageString)
          .catch((error) => {
            this.#logger.error('Error retransmitting message:', error);
          });
      }
    }
    this.#startAckTimeout();
  }

  /**
   * Discard all pending messages due to delivery failure.
   *
   * @param reason - The reason for failure.
   */
  #rejectAllPending(reason: string): void {
    const pendingCount = this.#getPendingCount();
    for (let i = 0; i < pendingCount; i += 1) {
      this.#logger.warn(
        `Message ${this.#startSeq + i} delivery failed: ${reason}`,
      );
    }
    // Mark all as rejected by advancing startSeq past all pending messages
    this.#startSeq = this.#nextSendSeq + 1;
    this.#kernelStore.setRemoteStartSeq(this.remoteId, this.#startSeq);
    this.#retryCount = 0;
  }

  /**
   * Start the delayed ACK timer. When it fires, a standalone ACK will be sent
   * if no outgoing message has piggybacked the ACK.
   */
  #startDelayedAck(): void {
    this.#clearDelayedAck();
    const ackValue = this.#getAckValue();
    if (ackValue === undefined) {
      return;
    }
    this.#delayedAckHandle = setTimeout(() => {
      this.#delayedAckHandle = undefined;
      this.#sendStandaloneAck();
    }, DELAYED_ACK_MS);
  }

  /**
   * Clear the delayed ACK timer.
   */
  #clearDelayedAck(): void {
    if (this.#delayedAckHandle) {
      clearTimeout(this.#delayedAckHandle);
      this.#delayedAckHandle = undefined;
    }
  }

  /**
   * Send a standalone ACK message (no payload, just acknowledges received messages).
   */
  #sendStandaloneAck(): void {
    const ackValue = this.#getAckValue();
    if (ackValue === undefined) {
      return;
    }
    const ackMessage = JSON.stringify({ ack: ackValue });
    this.#logger.log(
      `${this.#peerId.slice(0, 8)}:: sending standalone ACK ${ackValue}`,
    );
    this.#remoteComms
      .sendRemoteMessage(this.#peerId, ackMessage)
      .catch((error) => {
        this.#logger.error('Error sending standalone ACK:', error);
      });
  }

  // --- Message sending ---

  /**
   * Transmit a message to the remote end of the connection.
   * Adds seq and ack fields, queues for ACK tracking, and sends.
   *
   * @param messageBase - The base message to send (without seq/ack).
   */
  async #sendRemoteCommand(
    messageBase: Delivery | RedeemURLRequest | RedeemURLReply,
  ): Promise<void> {
    if (this.#needsHinting) {
      // Hints are registered lazily because (a) transmitting to the platform
      // services process has to be done asynchronously, which is very painful
      // to do at construction time, and (b) after a kernel restart (when we
      // might have a lot of known peers with hint information) connection
      // re-establishment will also be lazy, with a reasonable chance of never
      // even happening if we never talk to a particular peer again. Instead, we
      // wait until we know a given peer needs to be communicated with before
      // bothering to send its hint info.
      //
      // Fire-and-forget: Don't await this call to avoid RPC deadlock when
      // this method is called inside an RPC handler (e.g., during remoteDeliver).
      this.#remoteComms
        .registerLocationHints(this.#peerId, this.#locationHints)
        .catch((error) => {
          this.#logger.error('Error registering location hints:', error);
        });
      this.#needsHinting = false;
    }

    // Check queue capacity before consuming any resources (seq number, ACK timer)
    if (this.#getPendingCount() >= MAX_PENDING_MESSAGES) {
      throw Error(
        `Message rejected: pending queue at capacity (${MAX_PENDING_MESSAGES})`,
      );
    }

    // Track whether this is the first pending message (before incrementing seq)
    const wasEmpty = !this.#hasPendingMessages();

    // Build full message with seq and optional piggyback ack
    const seq = this.#getNextSeq();
    const ack = this.#getAckValue();
    const remoteCommand: RemoteCommand =
      ack === undefined
        ? { seq, ...messageBase }
        : { seq, ack, ...messageBase };
    const messageString = JSON.stringify(remoteCommand);

    // Clear delayed ACK timer - we're piggybacking the ACK on this message
    this.#clearDelayedAck();

    // Crash-safe enqueue order:
    // 1. Persist message first
    // 2. If first message, persist startSeq (so recovery knows where queue begins)
    // 3. Persist nextSendSeq last (recovery can repair this by scanning)
    this.#kernelStore.setPendingMessage(this.remoteId, seq, messageString);

    if (wasEmpty) {
      this.#startSeq = seq;
      this.#kernelStore.setRemoteStartSeq(this.remoteId, seq);
    }

    this.#kernelStore.setRemoteNextSendSeq(this.remoteId, this.#nextSendSeq);

    // Start ACK timeout if this is the first pending message
    if (wasEmpty) {
      this.#startAckTimeout();
    }

    // Send the message (non-blocking - don't wait for ACK)
    this.#remoteComms
      .sendRemoteMessage(this.#peerId, messageString)
      .catch((error) => {
        // Handle intentional close errors specially - reject pending redemptions
        if (
          error instanceof Error &&
          error.message.includes('intentional close')
        ) {
          this.#clearAckTimeout();
          this.#rejectAllPending('intentional close');
          this.rejectPendingRedemptions(
            'Message delivery failed after intentional close',
          );
          // Notify RemoteManager to reject kernel promises for this remote
          this.#onGiveUp?.(this.#peerId);
          return;
        }
        this.#logger.error('Error sending remote message:', error);
      });
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
   * Sends the reply via #sendRemoteCommand to ensure it gets seq/ack tracking.
   *
   * @param url - The ocap URL attempting to be redeemed.
   * @param replyKey - A sender-provided tag to send with the reply.
   */
  async #handleRedeemURLRequest(url: string, replyKey: string): Promise<void> {
    assert.typeof(replyKey, 'string');
    let kref: string;
    try {
      kref = await this.#remoteComms.redeemLocalOcapURL(url);
    } catch (error) {
      await this.#sendRemoteCommand({
        method: 'redeemURLReply',
        params: [false, replyKey, `${(error as Error).message}`],
      });
      return;
    }
    const eref = this.#kernelStore.translateRefKtoE(this.remoteId, kref, true);
    await this.#sendRemoteCommand({
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
  /**
   * Prepare to handle a redeemURLReply - validates and translates but does NOT
   * modify in-memory state. Returns the data needed to complete the operation.
   *
   * @param success - Whether the redemption was successful.
   * @param replyKey - The reply key for matching to pending redemption.
   * @param result - Either the kref (on success) or error message (on failure).
   * @returns Data needed to complete the operation after commit.
   */
  #prepareRedeemURLReply(
    success: boolean,
    replyKey: string,
    result: string,
  ): { replyKey: string; success: boolean; value: string } {
    // Validate the replyKey exists - if not, this is an error and we should throw
    // (which will cause the savepoint to roll back)
    if (!this.#pendingRedemptions.has(replyKey)) {
      throw Error(`unknown URL redemption reply key ${replyKey}`);
    }
    // Translate ref inside transaction (database operation)
    const value = success
      ? this.#kernelStore.translateRefEtoK(this.remoteId, result)
      : result;
    return { replyKey, success, value };
  }

  /**
   * Complete a redeemURLReply after transaction commits - modifies in-memory state.
   *
   * @param data - The data from #prepareRedeemURLReply.
   * @param data.replyKey - The reply key for matching to pending redemption.
   * @param data.success - Whether the redemption was successful.
   * @param data.value - The translated kref (on success) or error message (on failure).
   */
  #completeRedeemURLReply(data: {
    replyKey: string;
    success: boolean;
    value: string;
  }): void {
    const handlers = this.#pendingRedemptions.get(data.replyKey);
    // handlers should exist since we validated in prepare, but check for safety
    if (handlers) {
      this.#pendingRedemptions.delete(data.replyKey);
      const [resolve, reject] = handlers;
      if (data.success) {
        resolve(data.value);
      } else {
        reject(data.value);
      }
    }
  }

  /**
   * Handle a communication received from the remote end.
   *
   * @param message - The message that was received.
   *
   * @returns a string containing a message to send back to the original message
   *   sender as a response, or null if no response is to be sent.
   */
  async handleRemoteMessage(message: string): Promise<string | null> {
    const parsed = JSON.parse(message);

    // Handle standalone ACK message (no seq, no method - just ack)
    if (parsed.ack !== undefined && parsed.seq === undefined) {
      this.#handleAck(parsed.ack);
      return null;
    }

    const remoteCommand = parsed as RemoteCommand;
    const { seq, ack, method, params } = remoteCommand;

    // Handle piggyback ACK if present (outside transaction - ACK processing is idempotent)
    if (ack !== undefined) {
      this.#handleAck(ack);
    }

    // Start delayed ACK timer - will send standalone ACK if no outgoing traffic
    this.#startDelayedAck();

    // Validate seq value.
    if (typeof seq !== 'number' || !Number.isInteger(seq) || seq < 1) {
      throw Error(`invalid message seq: ${seq}`);
    }

    // Duplicate detection: skip if we've already processed this sequence number
    if (seq <= this.#highestReceivedSeq) {
      this.#logger.log(
        `${this.#peerId.slice(0, 8)}:: ignoring duplicate message seq=${seq} (highestReceived=${this.#highestReceivedSeq})`,
      );
      return null;
    }

    // Wrap message processing in a transaction for atomicity: Either both (1)
    // message processing and (2) seq update succeed together, or neither
    // happens. This ensures crash-safe exactly-once delivery.
    const savepointName = `receive_${this.remoteId}_${seq}`;
    this.#kernelStore.createSavepoint(savepointName);

    // Deferred operations to complete after commit (for redeemURLReply)
    let redemptionResult:
      | { replyKey: string; success: boolean; value: string }
      | undefined;

    try {
      switch (method) {
        case 'deliver':
          this.#handleRemoteDeliver(params);
          break;
        case 'redeemURL':
          // Reply is sent via #sendRemoteCommand for proper seq/ack tracking
          await this.#handleRedeemURLRequest(...params);
          break;
        case 'redeemURLReply':
          // Prepare but don't complete - in-memory changes deferred until after commit
          redemptionResult = this.#prepareRedeemURLReply(...params);
          break;
        default:
          // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
          throw Error(`unknown remote message type ${method}`);
      }

      // Persist sequence tracking at the end, within the transaction
      this.#kernelStore.setRemoteHighestReceivedSeq(this.remoteId, seq);

      // Commit the transaction
      this.#kernelStore.releaseSavepoint(savepointName);

      // === All in-memory state changes happen AFTER commit ===

      // Update in-memory seq state only after successful commit. This ensures any
      // ACK piggybacked on outgoing messages doesn't acknowledge uncommitted
      // message receipts.
      this.#highestReceivedSeq = seq;

      // Complete deferred redeemURLReply (delete from map, resolve/reject promise)
      if (redemptionResult) {
        this.#completeRedeemURLReply(redemptionResult);
      }

      // Restart delayed ACK timer. The timer was started at the beginning of
      // message processing, but if a reply was sent during the transaction (e.g.,
      // redeemURLReply), #sendRemoteCommand cleared the timer. Since the reply
      // couldn't piggyback the ACK (we hadn't committed yet), we need to ensure
      // a standalone ACK is sent.
      this.#startDelayedAck();
    } catch (error) {
      // Rollback on any error - in-memory state unchanged since we didn't update it yet
      this.#kernelStore.rollbackSavepoint(savepointName);
      throw error;
    }
    return null;
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

  /**
   * Clean up resources held by this RemoteHandle.
   * Clears all timers and rejects pending promises to prevent resource leaks
   * and allow garbage collection. Called by RemoteManager during cleanup.
   */
  cleanup(): void {
    this.#clearAckTimeout();
    this.#clearDelayedAck();
    this.rejectPendingRedemptions('Remote connection cleanup');
  }
}
