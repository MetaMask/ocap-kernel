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
| **Transactional turns** | ✓ | Crank buffering defers outputs until crank commit |
| **Deferred transmission** | **Partial** | Buffered within kernel, but RemoteHandle transmits immediately on flush |

### Recent Improvements: Crank Buffering

The crank buffering feature (issue #786) significantly improves our alignment with Ken:

**Our new crank model:**
```
crank_start(deliver one item from run queue)
  → create database savepoint
  → vat processes message
  → vat syscalls buffer outputs (sends, notifications) in CrankBuffer
crank_end:
  → if success: atomically flush buffer to run queue + commit state
  → if failure: rollback to savepoint, discard buffer
```

This achieves Ken's core property that **outputs are only externalized after successful turn completion**. Within the kernel:
- `enqueueSend(target, message, immediate=false)` buffers sends
- `enqueueNotify(endpoint, kpid, immediate=false)` buffers notifications
- `resolvePromises(endpoint, resolutions, immediate=false)` buffers all resolution effects
- On successful crank: `#flushCrankBuffer()` moves items to run queue
- On rollback: buffer is discarded along with database changes

### What We're Still Missing or Differs

#### 1. Deferred Network Transmission (Gap)

**Ken's model:**
```
persist checkpoint → THEN transmit to network
```

**Our model:**
```
crank completes → flush to run queue → eventually delivered to RemoteHandle
RemoteHandle: persist message → transmit immediately
```

While crank outputs are now buffered until crank commit, when a message reaches `RemoteHandle` for remote transmission, it is persisted and transmitted in quick succession. A crash between persist and transmit could result in the message being retransmitted on recovery (which is fine due to idempotency), but more critically, there's no coordination ensuring the kernel's crank commit happens before network transmission.

**Impact**: If RemoteHandle transmits a message and then the kernel crashes before its crank fully commits, the remote has received a message that the local kernel will "forget" on recovery. This violates output validity.

**Mitigation needed**: RemoteHandle should only transmit messages after the originating crank has been fully committed. This requires coordination between the kernel's crank lifecycle and RemoteHandle's transmission timing.

#### 2. Done Table / Duplicate Detection (Gap)

Ken maintains a `Done` table ensuring:
- Each message delivered to application **at most once**
- FIFO ordering enforced via `next_ready()` considering seq + sender ID

We track `highestReceivedSeq` but only for ACK purposes. We don't have explicit duplicate detection for incoming messages. If the remote retransmits a message we already processed (but before we ACKed), we could deliver it twice.

#### 3. Output Validity (Improved, but Partial)

Ken guarantees outputs could have resulted from failure-free execution because:
- Outputs are buffered during a turn
- A crash during processing loses all outputs from that turn
- Only committed outputs escape to the outside world

**Improvement**: With crank buffering, kernel-internal outputs (sends to local vats, notifications) are now properly buffered and discarded on rollback. A crash mid-crank no longer results in partial kernel state.

**Remaining gap**: For remote messages, the gap described in #1 above means network transmissions could still escape before the crank is fully committed.

#### 4. Atomic Checkpoint (Improved)

Ken atomically checkpoints `(turn, app_state, Q_out, Done)` together at end of turn.

**Improvement**: The kernel now uses database savepoints to make crank state changes atomic. The `CrankBuffer` contents are flushed atomically with the crank commit.

**Remaining gap**: RemoteHandle's message persistence is separate from the kernel's crank commit. These two persistence operations are not atomic with respect to each other.

#### 5. FIFO Enforcement on Receive (Gap)

Hold out-of-order messages until predecessors processed:
- Track expected next seq per sender
- Buffer messages that arrive out of order
- Deliver in sequence order only

We don't currently enforce FIFO delivery order on the receive side.

### Summary Table

| Ken Property | Our System | Notes |
|--------------|------------|-------|
| Exactly-once delivery | **Partial** | At-least-once with no duplicate detection |
| Output validity | **Partial** | ✓ for kernel-internal, gap for remote transmission |
| Transactional turns | **Yes** | Crank buffering provides turn boundaries |
| Consistent frontier | **Partial** | Kernel state atomic, but not coordinated with RemoteHandle |
| Local recovery | **Yes** | Crashes don't affect other processes |
| Sender-based logging | **Yes** | Messages persisted until ACKed |
| Deferred transmission | **Partial** | ✓ within kernel, gap at network boundary |
| FIFO ordering | **Partial** | Per-sender seq, but no enforcement on receive side |

## What Would Be Needed to Achieve Full Ken Properties

### 1. Coordinate RemoteHandle with Crank Commit (Critical)

The most important remaining gap. Options:

**Option A: Two-phase approach**
- During crank: RemoteHandle persists message but does NOT transmit
- After crank commit: Signal RemoteHandle to transmit persisted messages
- Requires: Crank commit notification mechanism to RemoteHandle

**Option B: Defer to run queue delivery**
- RemoteHandle only transmits when it receives a "transmit" item from run queue
- Crank buffers "transmit" items along with other outputs
- Flush adds transmit items to run queue
- RemoteHandle processes transmit items after crank commit

### 2. Add Done Table

Track processed message IDs, deduplicate on receive:
- Persist `Done` table entries for processed messages
- On receive, check if message already in `Done` before delivering
- ACK messages in `Done` without re-delivering

### 3. FIFO Enforcement on Receive

Hold out-of-order messages until predecessors processed:
- Track expected next seq per sender
- Buffer messages that arrive out of order
- Deliver in sequence order only

## Architectural Implications

The crank buffering work has brought us significantly closer to Ken's model:

**Before crank buffering:**
```
Kernel Crank:
  process message → syscalls immediately enqueue to run queue

RemoteHandle (independent):
  persist each outgoing message → transmit immediately
```

**After crank buffering:**
```
Kernel Crank:
  process message → syscalls buffer outputs

Crank Commit (atomic):
  persist(kernel_state) + flush(buffered_outputs to run queue)

RemoteHandle (still independent):
  receive from run queue → persist → transmit immediately
```

**Ken-style architecture (goal):**
```
Kernel Crank:
  process message → syscalls buffer outputs

Crank Commit (atomic):
  persist(kernel_state, buffered_outputs, done_table)

Post-Commit:
  signal RemoteHandle to transmit persisted messages
```

The key remaining work is ensuring that network transmission only happens after the crank that produced the message has been fully committed.

## Progress Summary

| Area | Before | After Crank Buffering |
|------|--------|----------------------|
| Kernel-internal output buffering | No | **Yes** |
| Rollback discards uncommitted outputs | No | **Yes** |
| Atomic kernel state + output queue | No | **Yes** |
| Network transmission deferred to commit | No | No (still needed) |
| Done table for deduplication | No | No (still needed) |
| FIFO enforcement on receive | No | No (still needed) |

## References

- HP Labs Tech Report HPL-2010-155: "Output-Valid Rollback-Recovery"
- Ken project: https://web.eecs.umich.edu/~tpkelly/Ken/
- Waterken (Ken implementation in Java): http://waterken.sourceforge.net/
