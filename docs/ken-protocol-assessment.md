# Ken Protocol Assessment

This document assesses our current remote messaging system against the ideals of the Ken protocol, as described in HP Labs Tech Report HPL-2010-155: "Output-Valid Rollback-Recovery" by Kelly, Karp, Stiegler, Close, and Cho.

## Ken Protocol Key Properties

The Ken protocol provides these guarantees for fault-tolerant distributed computing:

1. **Exactly-once delivery** in process-pairwise FIFO order
2. **Output validity**: Outputs could have resulted from failure-free execution
3. **Transactional turns**: One message delivered → processing → checkpoint → transmit outputs
4. **Consistent frontier**: Most-recent per-process checkpoints always form a recovery line
5. **Local recovery**: Crashes cause only local rollbacks, no domino effect
6. **Sender-based message logging**: Messages persisted in sender's output queue until ACKed
7. **Deferred transmission**: Outputs buffered during turn, transmitted only after checkpoint

### Ken's Turn Model

A "turn" in Ken is the fundamental unit of computation:

```
turn_start(deliver exactly one message to processing_function)
  → processing_function executes
  → outputs buffered in Q_out (not transmitted yet)
turn_end:
  → atomically persist(turn, app_state, Q_out, Done)
  → THEN transmit buffered messages
```

Key aspects:
- Only one message delivered per turn
- All outputs buffered until end of turn
- Atomic checkpoint includes application state AND output queue
- Transmission happens only after checkpoint completes
- `Done` table tracks which messages have been processed to completion

## Assessment of Our Current System

### What We Have (Aligned with Ken)

| Property | Status | Implementation |
|----------|--------|----------------|
| Sender-based logging | ✓ | Messages persisted at `remotePending.${remoteId}.${seq}` |
| Sequence numbers | ✓ | `seq` on outgoing, `highestReceivedSeq` for incoming |
| Cumulative ACK | ✓ | Piggyback ACKs acknowledge all messages up to seq |
| Retransmission | ✓ | Timeout-based retransmit until ACK or max retries |
| Crash-safe persistence | ✓ | Write message first, then update nextSendSeq |
| Local recovery | ✓ | Restore seq state, restart ACK timeout |
| Transactional turns | ✓ | Crank buffering defers outputs until crank commit |
| Deferred transmission | ✓ | Outputs reach RemoteHandle only after originating crank commits |
| Output validity | ✓ | Crank buffering ensures outputs escape only after commit |
| Atomic checkpoint | ✓ | Database savepoints make crank state changes atomic |

### Crank Buffering (Issue #786)

The crank buffering feature achieves Ken's core send-side properties:

**Our crank model:**
```
crank_start(deliver one item from run queue)
  → create database savepoint
  → vat processes message
  → vat syscalls buffer outputs (sends, notifications) in CrankBuffer
crank_end:
  → if success: atomically flush buffer to run queue + commit state
  → if failure: rollback to savepoint, discard buffer
```

This achieves Ken's property that **outputs are only externalized after successful turn completion**:

- `enqueueSend(target, message, immediate=false)` buffers sends
- `enqueueNotify(endpoint, kpid, immediate=false)` buffers notifications
- `resolvePromises(endpoint, resolutions, immediate=false)` buffers all resolution effects
- On successful crank: `#flushCrankBuffer()` moves items to persistent run queue
- On rollback: buffer is discarded along with database changes

**Why output validity is achieved**: When a message destined for a remote reaches `RemoteHandle`, it arrives via the run queue. Items only reach the run queue after the originating crank commits. Therefore, by the time `RemoteHandle` persists and transmits a message, the crank that produced it has already committed. The transmitted message corresponds to committed local state.

`RemoteHandle` persists messages to `remotePending` before transmitting for a different reason: to enable retransmission on recovery if the transmission or ACK is lost. This is part of the at-least-once delivery mechanism, not the output validity mechanism.

### Remaining Gaps (Receive Side)

The remaining gaps are on the **receive side** of remote messaging. Code review of `RemoteHandle.handleRemoteMessage()` revealed specific bugs:

#### 1. No Duplicate Detection (Bug)

Ken maintains a `Done` table ensuring each message is delivered to the application **at most once**.

**Current code behavior** (`RemoteHandle.ts` lines 830-845):
```typescript
// Track received sequence number for piggyback ACK and persist
if (seq > this.#highestReceivedSeq) {
  this.#highestReceivedSeq = seq;
  this.#kernelStore.setRemoteHighestReceivedSeq(this.remoteId, seq);
}
// ... then UNCONDITIONALLY:
switch (method) {
  case 'deliver':
    this.#handleRemoteDeliver(params);  // Always runs, even for duplicates!
```

**Problem**: There is no deduplication check. Even when `seq <= highestReceivedSeq`, the message is processed. After a crash and retransmit, duplicate messages will be delivered to the vat.

#### 2. Wrong Persistence Order (Bug)

**Current behavior**: `highestReceivedSeq` is persisted BEFORE the message is processed and added to the run queue.

**Crash scenario**:
1. Receive message seq=5 from remote R
2. Update and persist `highestReceivedSeq` to 5
3. Crash before message is added to run queue
4. On recovery: `highestReceivedSeq=5` suggests we received it
5. Remote retransmits seq=5, we (correctly) ignore it due to dedup check (once fixed)
6. **Message lost** - never reached the run queue

**What's needed**: Process the message first (add to run queue), then persist `highestReceivedSeq`. Ideally these should be atomic.

#### 3. FIFO Enforcement on Receive (Not a Gap)

Ken enforces per-sender FIFO ordering via `next_ready()` which only delivers the next expected sequence number.

**Our situation**: We use TCP-based transports (libp2p streams) which guarantee in-order delivery during normal operation. Out-of-order arrival only occurs after a crash when the sender retransmits. With proper deduplication (fix #1 above), retransmitted messages for already-processed sequence numbers will be dropped, maintaining FIFO semantics.

Therefore, explicit receive-side reordering is not required given our transport guarantees.

### Summary Table

| Ken Property | Our System | Notes |
|--------------|------------|-------|
| Transactional turns | **Yes** | Crank buffering provides turn boundaries |
| Output validity | **Yes** | Outputs escape only after originating crank commits |
| Deferred transmission | **Yes** | Run queue staging ensures this |
| Atomic checkpoint | **Yes** | Database savepoints for kernel state |
| Consistent frontier | **Yes** | Each kernel's checkpoint is independent |
| Local recovery | **Yes** | Crashes don't affect other processes |
| Sender-based logging | **Yes** | Messages persisted in remotePending until ACKed |
| Exactly-once delivery | **Bug** | Needs transactional receive with dedup check |
| FIFO ordering | **Yes** | TCP guarantees in-order; dedup handles retransmits |

## Required Fix

Wrap `handleRemoteMessage()` in a database transaction with dedup check:

```typescript
handleRemoteMessage(seq, method, params) {
  // Begin transaction

  // Dedup check - must be inside transaction to read committed state
  if (seq <= this.#highestReceivedSeq) {
    // Already received, ACK but don't process
    return;
  }

  // Process message (translate refs, add to run queue, etc.)
  switch (method) {
    case 'deliver': ...
    case 'resolve': ...
    case 'gc': ...
  }

  // Update sequence tracking
  this.#highestReceivedSeq = seq;
  this.#kernelStore.setRemoteHighestReceivedSeq(this.remoteId, seq);

  // Commit transaction
}
```

This achieves atomicity without restructuring the existing message handling code. If a crash occurs before commit, both the run queue entry and the sequence update roll back together - the remote retransmits, and we process it correctly.

The transaction approach is simpler than reordering because `handleRemoteMessage` handles multiple message types (`deliver`, `resolve`, `gc`) with different processing paths, and reference slots require translation before persistence.

## Architectural Summary

**Send side (achieved with crank buffering):**
```
Vat Crank:
  vat processes message → syscalls buffer outputs

Crank Commit (atomic):
  persist(vat_state) + flush(buffered_outputs to run queue)

Later (separate operation):
  run queue delivers to RemoteHandle → persist to remotePending → transmit
```

The key insight: by the time RemoteHandle sees a message, the originating crank has already committed. Output validity is achieved.

**Receive side (bugs to fix):**
```
Current (buggy):
  receive from network
    → persist highestReceivedSeq (WRONG: too early)
    → process message unconditionally (WRONG: no dedup)
    → add to run queue

Fixed (wrap in transaction):
  receive from network
    → begin transaction
    → check seq <= highestReceivedSeq (skip if duplicate)
    → process message, add to run queue
    → persist highestReceivedSeq
    → commit transaction
```

## Progress Summary

| Area | Status |
|------|--------|
| Kernel-internal output buffering | **Achieved** |
| Rollback discards uncommitted outputs | **Achieved** |
| Atomic kernel state + output queue | **Achieved** |
| Output validity (send side) | **Achieved** |
| Deferred transmission (send side) | **Achieved** |
| FIFO ordering | **Achieved** (TCP transport) |
| Exactly-once receive (dedup + atomicity) | **Bug** - needs transactional fix |

## References

- HP Labs Tech Report HPL-2010-155: "Output-Valid Rollback-Recovery"
- Ken project: https://web.eecs.umich.edu/~tpkelly/Ken/
- Waterken (Ken implementation in Java): http://waterken.sourceforge.net/
