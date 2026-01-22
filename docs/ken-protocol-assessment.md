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

### What We're Missing or Differs

#### 1. Transactional Turns (Major Gap)

**Ken's model:**
```
turn_start(deliver one message)
  → processing_function executes
  → outputs buffered in Q_out
turn_end:
  → atomically persist(turn, app_state, Q_out, Done)
  → THEN transmit buffered messages
```

**Our model:**
```
message received → kernel processes → sends outputs immediately
each output: persist message → update seq → transmit
```

The kernel's "crank" mechanism may provide turn-like boundaries, but `RemoteHandle` doesn't coordinate with it. Messages are transmitted immediately after being persisted, not deferred until end of turn.

#### 2. Done Table / Duplicate Detection (Gap)

Ken maintains a `Done` table ensuring:
- Each message delivered to application **at most once**
- FIFO ordering enforced via `next_ready()` considering seq + sender ID

We track `highestReceivedSeq` but only for ACK purposes. We don't have explicit duplicate detection for incoming messages. If the remote retransmits a message we already processed (but before we ACKed), we could deliver it twice.

#### 3. Output Validity (Partial)

Ken guarantees outputs could have resulted from failure-free execution because:
- Outputs are buffered during a turn
- A crash during processing loses all outputs from that turn
- Only committed outputs escape to the outside world

Our system transmits immediately after persisting, so a crash mid-crank could result in:
- Some messages transmitted to remote
- But kernel state not yet committed
- On recovery, kernel re-executes and sends different/duplicate messages

#### 4. Atomic Checkpoint (Gap)

Ken atomically checkpoints `(turn, app_state, Q_out, Done)` together at end of turn.

Our system persists messages individually as sent. There's no atomic boundary coordinating kernel state with outgoing message state.

#### 5. Deferred Transmission (Gap)

**Ken:** `persist checkpoint → THEN transmit`

**Ours:** `persist message → transmit immediately`

Ken's approach ensures the "send" is recorded in checkpoint before any transmission. This is crucial for the consistent frontier property.

#### 6. Input Queue Handling (Gap)

Ken can opportunistically persist incoming messages before delivery. On crash, the input queue is reconstructed from sender retransmissions.

We don't persist incoming messages. On crash, we rely entirely on senders to retransmit.

### Summary Table

| Ken Property | Our System | Notes |
|--------------|------------|-------|
| Exactly-once delivery | **Partial** | At-least-once with no duplicate detection |
| Output validity | **No** | Immediate transmission, no turn boundaries |
| Transactional turns | **No** | No coordination with kernel cranks |
| Consistent frontier | **Partial** | No atomic checkpoint across kernel+remote state |
| Local recovery | **Yes** | Crashes don't affect other processes |
| Sender-based logging | **Yes** | Messages persisted until ACKed |
| FIFO ordering | **Partial** | Per-sender seq, but no enforcement on receive side |

## What Would Be Needed to Achieve Ken Properties

### 1. Coordinate with Kernel Crank Boundaries

Buffer outgoing messages during crank execution, persist and transmit only at crank commit. This would require:
- `RemoteHandle` to be aware of crank boundaries
- Outgoing messages buffered in memory during crank
- Batch persist + transmit at crank commit

### 2. Add Done Table

Track processed message IDs, deduplicate on receive:
- Persist `Done` table entries for processed messages
- On receive, check if message already in `Done` before delivering
- ACK messages in `Done` without re-delivering

### 3. Atomic Checkpoint

Persist kernel state and output queue together:
- Single atomic write at end of crank
- Include: kernel state, outgoing messages, Done table updates
- Requires coordination between kernel store and remote message persistence

### 4. Defer Transmission

Transmit only after checkpoint completes:
- Buffer messages during turn
- After atomic checkpoint succeeds, release messages for transmission
- This ensures "send" is recorded before any transmission occurs

### 5. FIFO Enforcement on Receive

Hold out-of-order messages until predecessors processed:
- Track expected next seq per sender
- Buffer messages that arrive out of order
- Deliver in sequence order only

## Architectural Implications

The most significant change would be integrating `RemoteHandle` with the kernel's crank/commit cycle. Currently:

```
Kernel Crank:
  process message → syscalls may send to remote

RemoteHandle (independent):
  persist each outgoing message → transmit immediately
```

Ken-style architecture:

```
Kernel Crank:
  process message → syscalls buffer outputs

Crank Commit (atomic):
  persist(kernel_state, buffered_outputs, done_table)

Post-Commit:
  transmit buffered outputs
```

This would require the kernel to control when `RemoteHandle` actually transmits, rather than `RemoteHandle` transmitting independently.

## References

- HP Labs Tech Report HPL-2010-155: "Output-Valid Rollback-Recovery"
- Ken project: https://web.eecs.umich.edu/~tpkelly/Ken/
- Waterken (Ken implementation in Java): http://waterken.sourceforge.net/
