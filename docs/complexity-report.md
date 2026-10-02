# Cyclomatic complexity report

Snapshot of `main` as of 2026-10-02. This covers per-function cyclomatic complexity (CC) across the monorepo, where the high-CC regions are and whether that complexity is needed, and how the core kernel logic could be made easier for a human to verify.

## TL;DR

- Functions here are simple by CC. Of 3,195 functions in 547 non-test source files, the median CC is 1, the mean is 2.1, 42 functions are above 10 and 8 are above 20. Nothing reaches 50.
- The kernel's real complexity doesn't appear in per-function CC. It's spread across functions as **invariants over shared mutable state**: refcounts, c-lists, promise decider/subscriber state, the GC action set, and crank savepoints. Most kernel functions are trivial on their own. What's hard to check is that they agree with each other about who holds a reference, when it moves, and what a rollback undoes.
- Most of the high-CC kernel code needs to be complex because the problem is. The way it's _expressed_ adds avoidable cost, mainly in three ways:
  1. Refcount releases are hand-written on every exit path (for example, four copies in `KernelRouter.#deliverSend`).
  2. The refcount rules live in two places, `incrementRefCount` and `computeExpectedRefCounts`, and a comment says to keep them in sync by hand.
  3. Channel and retry state in the remote-comms layer is encoded in nested `try`/`catch` and flag checks, not as an explicit state machine.
- Outside the kernel, the worst CC is in non-core packages and is mostly reducible. In `evm-wallet-experiment`, about 400 lines of complex code are byte-for-byte copies between `home-coordinator.ts` and `away-coordinator.ts`, and `kernel-ui/src/services/db-parser.ts` (CC 45) re-derives the kernel store's key schema with regexes.

## Method

The function tree of every git-tracked `packages/*/src/**/*.{ts,tsx,js,mjs}` file, excluding tests, `test/` directories and `.d.ts`, was parsed with the TypeScript compiler API. Each function starts at 1, and the following each add 1: `if`, `?:`, `case` (but not `default`), `for`, `for…in`, `for…of`, `while`, `do`, `catch`, `&&`, `||`, `??`, `&&=`, `||=` and `??=`. This is close to ESLint's `complexity` rule, but default parameters and `?.` aren't counted. A nested function counts toward itself, not toward the function that encloses it. "Nest" means the maximum depth of nested control structures.

CC measures the number of linearly independent paths through one function. It doesn't measure how many states a set of functions can reach together, and that's what matters for this kernel. Read the numbers below as a map of where to look, not as a score.

## Monorepo overview

| CC range | Functions |
| -------: | --------: |
|      1–5 |     3,011 |
|     6–10 |       142 |
|    11–20 |        34 |
|    21–50 |         8 |
|      >50 |         0 |

| Package                         | Functions |  ΣCC | Mean CC | Max | >10 | >20 |   LOC |
| ------------------------------- | --------: | ---: | ------: | --: | --: | --: | ----: |
| `ocap-kernel`                   |       853 | 1976 |    2.32 |  23 |  18 |   1 | 20635 |
| `evm-wallet-experiment`         |       330 | 1023 |    3.10 |  25 |  16 |   4 |  9433 |
| `kernel-test`                   |       303 |  422 |    1.39 |   5 |   0 |   0 |  3570 |
| `kernel-ui`                     |       186 |  369 |    1.98 |  45 |   1 |   1 |  3104 |
| `kernel-cli`                    |       168 |  345 |    2.05 |  16 |   1 |   0 |  2513 |
| `kernel-utils`                  |       123 |  320 |    2.60 |  37 |   2 |   1 |  2809 |
| `streams`                       |       137 |  219 |    1.60 |   7 |   0 |   0 |  2184 |
| `kernel-agents-repl`            |        84 |  184 |    2.19 |  23 |   1 |   1 |  1493 |
| `kernel-node-runtime`           |        93 |  183 |    1.97 |  10 |   0 |   0 |  1591 |
| `kernel-browser-runtime`        |       108 |  173 |    1.60 |  11 |   1 |   0 |  1970 |
| `kernel-language-model-service` |        72 |  164 |    2.28 |  10 |   0 |   0 |  1794 |
| `kernel-agents`                 |        86 |  143 |    1.66 |  17 |   1 |   0 |  1747 |
| `kernel-errors`                 |        48 |   88 |    1.83 |  14 |   1 |   0 |  1557 |
| `kernel-store`                  |        50 |   98 |    1.96 |   5 |   0 |   0 |   924 |
| All other packages              |       554 | 1011 |    1.82 |  10 |   0 |   0 | 10733 |

Inside `ocap-kernel`, ΣCC by directory is: `store/methods` 480, `remotes/platform` 351, the package root (`Kernel`, `KernelQueue`, `KernelRouter`, `types`) 304, `remotes/kernel` 266, `vats` 266, then `garbage-collection` 51. Two-thirds of the kernel's branching is therefore in persistent-state bookkeeping and networking, not in the scheduling and routing code that's usually read as "the kernel".

## High-complexity regions

### Core kernel (`packages/ocap-kernel/src`)

|  CC | Nest | LOC | Function                                                              | Is the complexity necessary?                                           |
| --: | ---: | --: | --------------------------------------------------------------------- | ---------------------------------------------------------------------- |
|  23 |    6 | 103 | `store/methods/gc.ts:148` `collectGarbage`                            | Mostly yes; the shape is reducible (see below)                         |
|  20 |    4 | 138 | `KernelRouter.ts:231` `#deliverSend`                                  | No. About half the paths repeat the same refcount release              |
|  19 |    3 | 234 | `remotes/kernel/remote-comms.ts:135` `initRemoteIdentity`             | Partly. It's setup with many optional inputs                           |
|  18 |    3 | 114 | `remotes/platform/reconnection-lifecycle.ts:88` `attemptReconnection` | The decisions are needed; mixing them into the loop isn't              |
|  18 |    4 | 143 | `remotes/platform/transport.ts:564` `sendRemoteMessage`               | The decisions are needed; the close-on-error code is repeated 4 times  |
|  17 |    2 | 100 | `remotes/kernel/RemoteHandle.ts:1321` `handleRemoteMessage`           | Yes. It's an exactly-once receive with a deferred two-phase completion |
|  16 |    5 | 146 | `store/methods/refcount-audit.ts:133` `computeExpectedRefCounts`      | Yes, but it re-states rules held elsewhere                             |
|  15 |    1 |  28 | `utils/network.ts:23` `isPrivateAddress`                              | No. It's a CIDR table written as boolean logic                         |
|  14 |    1 |  68 | `store/methods/translators.ts:226` `translateSyscallVtoK`             | Yes. It's an exhaustive switch over the syscall union                  |
|  14 |    2 | 110 | `vats/SubclusterManager.ts:345` `#launchVatsForSubcluster`            | Partly                                                                 |
|  12 |    3 |  55 | `KernelQueue.ts:585` `resolvePromises`                                | Yes. Each check is a security precondition                             |
|  12 |    1 | 102 | `vats/VatSyscall.ts:160` `handleSyscall`                              | Yes as a dispatch; each case is trivial                                |
|  11 |    4 |  76 | `KernelQueue.ts:130` `#runLoop`                                       | Yes. It's the transaction and rollback protocol                        |
|  10 |    3 |  72 | `KernelQueue.ts:345` `#processCrankResult`                            | Yes, and its ordering is subtle                                        |

The full list of kernel functions with CC ≥ 10 is in the appendix.

### Outside the kernel

|    CC | Function                                                                          | Assessment                                                                                                                                                                                           |
| ----: | --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
|    45 | `kernel-ui/src/services/db-parser.ts:17` `parseObjectRegistry`                    | Reducible. A regex chain over raw KV keys duplicates the store's key schema, which lives in `ocap-kernel/src/store/methods/base.ts` and siblings, and will drift from it silently                    |
|    37 | `kernel-utils/src/guarded-fetch.ts:260` `guardedFetch`                            | Mostly necessary. It re-implements the Fetch spec's redirect algorithm so each hop can be checked. Most of the CC is `init ?? request` defaulting, which could move into a `mergeRequestInit` helper |
|    25 | `evm-wallet-experiment/src/lib/delegation.ts:174` `explainDelegationMatch`        | A rule list written as an `if` chain. It could be a table of `{ check, explain }`                                                                                                                    |
| 21 ×2 | `buildAndSubmitUserOp` in `home-coordinator.ts:645` and `away-coordinator.ts:511` | Byte-for-byte duplicates, as are `createStateless7702SmartAccount` (CC 14 ×2) and `pollTransactionReceipt` (CC 12 ×2). About 400 lines could move to a shared `lib/` module                          |
|    23 | `kernel-agents-repl/.../prepare-evaluation.ts:134` `prepareEvaluation`            | AST-shape handling. Mostly necessary                                                                                                                                                                 |

The two coordinator vats contain the longest functions in the repo: their `buildRootObject` closures are 2,157 and 1,806 lines. Their CC is low because the closures are only containers, but files that size are hard to review whatever their CC.

## The decisions the kernel has to make

The kernel's high-CC functions sit at the points where it has to settle one of the questions below. These questions come from the problem, so no refactor will remove them. What a refactor can change is whether each one is answered in one readable place or across several.

1. **Where does a message go?** (`KernelRouter.#routeMessage`) A target is an object or a promise. A promise can be unresolved, which means the message is queued on it. It can be fulfilled to an object, which means the message is forwarded; to another promise, which means it's requeued; or to data, which means the message goes splat. It can be rejected, which means splat. If the target is an object, it can be revoked, ownerless, owned by the kernel, owned by a vat that has gone away, or owned by a live vat or remote. That's about 8 destinations, each with its own refcount and result-promise handling.
2. **Who holds a reference, and when does the hold move?** Every kref that the run queue, a promise queue, a resolution value, a c-list entry, a pin or the crank buffer holds is counted. Objects carry two counts (reachable and recognizable), with the rule reachable ≤ recognizable. An import's reachable half lives in the c-list's reachable flag, not in the count. Each delivery path has to move or release exactly the units it took. A unit too many leaks; a unit too few is a use-after-free that `setObjectRefCount` catches only when the count would go negative.
3. **What happens to something nobody references?** (`collectGarbage`, `processGCActionSet`) It depends on the owner: the kernel, a live vat, a terminated vat that's still being deleted slowly, or nobody, which makes the object orphaned. It also depends on which of the two counts reached zero. The result is `dropExport`, `retireExport`, `retireImport`, a direct delete, or nothing, and actions are deduplicated and given priority per endpoint.
4. **Who may settle a promise?** (`resolvePromises`) Only its current decider, only once, and only after the checks pass. Refcount charges are taken only after legality is established, so an illegal resolve leaks nothing.
5. **What survives a failed crank?** (`#runLoop`, `#processCrankResult`) There are nested savepoints (`crank` and `delivery`). Only `delivery` is ever rolled back. A vat's death has to commit even when its delivery aborted. The refcount audit has to run before or after the crank-buffer flush depending on whether rollback is still possible.
6. **Has a remote message already been applied?** (`RemoteHandle.handleRemoteMessage`) Duplicates are dropped by sequence number. The handler, the seq update and the commit happen inside one savepoint. In-memory state such as `#highestReceivedSeq` and the BOYD flag changes only after commit, so a piggybacked ACK never acknowledges uncommitted work.
7. **Is a peer reachable, restarted, rate-limited or dead?** (`transport.ts`, `reconnection-lifecycle.ts`, `connection-factory.ts`) Errors are sorted into abort, rate-limit (with the attempt refunded), connection-limit, non-retryable, retryable and permanent failure. Concurrent dials race against inbound channels, and a peer that restarts during the handshake has to be handled without overwriting a channel registered at the same time.

The first five run inside the trusted computing base. A mistake in them breaks ocap safety: a vat reaches an object it was never given, a promise is settled by an endpoint without the authority to settle it, or an object is freed while someone still holds it. That's where verifiability matters most.

## Is the complexity necessary? Region by region

### `KernelRouter.#deliverSend` (CC 20): mostly not

Routing has three outcomes (splat, send, requeue), and delivery adds a fourth, "endpoint vanished". Each of the four paths ends by releasing the run-queue item's units: the target, the result and every slot, each under its own tag. That gives four nearly identical release blocks, and the order of operations differs between them. On the send path, `setPromiseDecider` runs before the result is released. On the requeue path, `enqueuePromiseMessage` takes its units before the item's are released, "so nothing transiently looks unreferenced". The "endpoint vanished" path settles the result promise and then releases. The logic is correct, but proving it means comparing four hand-written copies of one rule.

The complexity that's actually needed is about 5 cases. The rest comes from the release being written out by hand on every path, and from the `endpoint` / `isKernelServiceMessage` flags being checked three separate times.

### `collectGarbage` (CC 23, nest 6): mostly yes, and the shape can improve

For each kref in `maybeFreeKrefs`, the function branches on whether it's a promise or an object, then on the owner (`'kernel'`, live, terminated, or none), then on which counts are zero. One of those branches doesn't need to exist in a correct kernel. The "owned by a live endpoint with no c-list entry" case is described in its own comment as unreachable once every disown path orphans, and it repairs the state and logs an error. That case is defensive repair code. It adds a path to the most safety-critical function only to tolerate a bug somewhere else.

The function also deliberately falls through from "terminated" to "orphaned". The comment explains it, but the flow is still non-obvious: `ownerVatID` is reassigned partway through so that a later `if` fires. Classifying the owner first (`'kernel' | 'live' | 'dying' | 'orphan'`) and then dispatching on that value would remove both the mutable variable and the fall-through.

### `KernelQueue.#runLoop` / `#processCrankResult` (CC 11 + 10): necessary

These functions carry the transaction protocol. The branching matches real distinctions: abort versus terminate, and rollback allowed versus already committed. The ordering rules are dense and mostly recorded only in comments. Examples are when `#deliveryRollbackAllowed` is cleared, why the audit runs before the flush when rollback is still possible and after it otherwise, and why `afterCommit` runs outside the `finally`. This code wouldn't get much simpler with fewer branches. It would get easier to verify if its state machine were written out explicitly (see recommendation 4).

### `RemoteHandle.handleRemoteMessage` (CC 17): necessary

This is an exactly-once receive with deferred two-phase completion. Every branch corresponds to a property in the protocol. Its structure is already good: validate, check for a duplicate, run a transaction, apply the post-commit effects, then complete. It only becomes hard to check when it's read alongside `#handleAck`, `#startDelayedAck` and the send side, which together control the in-memory sequence state.

### `sendRemoteMessage` / `attemptReconnection` (CC 18 + 18): the decisions are necessary, the encoding isn't

Both functions mix a policy (what to do with this error or this connection state) with mechanics (the loop, the awaits, the logging). Close-on-error appears four times in `sendRemoteMessage`. In `attemptReconnection`, the error classification is an `if` chain inside the loop's `catch`. If that classification were a pure function, `classify(problem, signal) → 'stop' | 'retry' | 'retry-refund' | 'give-up'`, it could be tested exhaustively from a table, and the loop would come down to a CC of about 5.

### `computeExpectedRefCounts` (CC 16): necessary, but duplicated

This is the independent oracle for refcount correctness, and it's the most valuable verification tool in the kernel. The `incrementRefCount` JSDoc and this function's JSDoc each say the other has to be kept in sync by hand. Each set of rules is checked only against the other, and both are written by hand.

### `translateSyscallVtoK`, `handleSyscall`, `parseRef`, `shouldProcessAction`: necessary, and in the right shape

These are exhaustive dispatches over a closed union. Their CC equals the number of variants, and each arm is short. Nothing needs to change except checking exhaustiveness at compile time. `handleSyscall`'s `default` case currently logs and returns `['ok', null]` for an unknown op, where an `assertNever` would fail the build.

## Making the core easier to verify

The recommendations are ordered by how much they would help in checking ocap safety, against the effort they cost.

### 1. Turn the refcount rules into one declarative table

Replace the two hand-written rule sets (`incrementRefCount` / `decrementRefCount` and `computeExpectedRefCounts`) with one table of **holder kinds**:

```ts
type Holder =
  | { kind: 'runQueueSend'; target: KRef; result?: KRef; slots: KRef[] }
  | { kind: 'promiseQueue'; kpid: KRef; message: Message }
  | { kind: 'resolutionValue'; kpid: KRef; slots: KRef[] }
  | {
      kind: 'clistImport';
      endpointId: EndpointId;
      kref: KRef;
      reachable: boolean;
    }
  | { kind: 'clistExport'; endpointId: EndpointId; kref: KRef }
  | { kind: 'pin'; kref: KRef }
  | { kind: 'unsettledPromise'; kpid: KRef };

/** The units a holder owns. The single source of truth for refcounting. */
function unitsHeldBy(holder: Holder): { kref: KRef; reachable: boolean }[];
```

Then make the mutating code call `acquire(holder)` and `release(holder)`, which apply `unitsHeldBy`, and make the audit sum `unitsHeldBy` over a scan of every holder in the store. A reviewer then checks one pure function against the spec, plus the fact that every holder created is eventually released. The second check is the subject of the next recommendation.

### 2. Make reference transfer structural

`#deliverSend` would become:

```ts
const route = this.#routeMessage(item);
const holder = runQueueSendHolder(item);
switch (route.kind) {
  case 'splat':
    this.#settleResult(item, route.error);
    break;
  case 'requeue':
    this.#kernelStore.enqueuePromiseMessage(route.target, item.message);
    break;
  case 'kernel':
    crankResult = this.#deliverKernelServiceMessage(route.target, item.message);
    break;
  case 'endpoint':
    crankResult = await this.#deliverToEndpoint(route, item);
    break;
}
this.#kernelStore.release(holder); // exactly once, on every path
```

Make `MessageRoute` a tagged union with `kind`, not `null` or a missing `endpointId`. Fold the "endpoint vanished" case into routing so that it becomes a `splat`, not a fourth exit path. The rule "every path releases the item's units exactly once" then holds by construction, and the expected CC is about 6. The "new holder first" ordering is preserved because `enqueuePromiseMessage` acquires before the shared `release`.

### 3. Turn defensive repair into an assertion in tests

For code that its own comments call unreachable, such as the live owner with no c-list entry in `collectGarbage`: when `auditRefCounts` is on (in tests and in `kernel-test`), throw instead of repairing. Keep the repair in production if availability requires it. That way a test run can't exercise the path silently, and a reviewer can skip it when checking the main logic.

### 4. Write the transaction protocol out as a state machine

Write the crank lifecycle as an explicit enum-like union with legal transitions, for example `idle → delivering → (aborted | terminating | committed-pending-flush) → committed`. Replace `#deliveryRollbackAllowed` with that state. `rollbackCrank`, `#flushCrankBuffer` and `assertRefCountsIfAuditing` would then assert that the current state allows them. The ordering rules that comments carry today become runtime checks, and a short markdown table could record the state diagram next to the code.

Apply the same idea to the per-peer channel lifecycle in the remote-comms layer (`none → dialing → handshaking → registered → closing`). Also add an `acquireChannel` helper that owns the close-on-failure cleanup.

### 5. Keep decisions pure and the shell imperative

Several high-CC functions are a pure decision tangled with effects. Pull the decision out as a pure function and test it with `it.each` over every input combination:

| Pure function to extract                                                                                   | From                                                                      |
| ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `routeMessage(promiseState, target info) → MessageRoute`                                                   | `KernelRouter.#routeMessage` (already almost pure)                        |
| `classifyOwner(...)`, then `gcDecision(owner, counts, reachableFlag) → GCAction[] \| 'delete' \| 'retire'` | `collectGarbage`                                                          |
| `classifyReconnectFailure(problem, aborted)`                                                               | `attemptReconnection`                                                     |
| `shouldProcessAction`                                                                                      | Already pure; make it the sole oracle and test it from a full truth table |

Then the GC decision table in `collectGarbage` fits on one screen and can be compared line by line with the SwingSet GC design it descends from.

### 6. Add property-based and model-based tests of the invariants

The repo has no property-based tests: there are no `fast-check` imports. The kernel already has the oracle such tests need, `computeExpectedRefCounts` together with `assertRefCountsIfAuditing`. A model-based test would generate random sequences of `send`, `subscribe`, `resolve`, `dropImports`, `retireImports`, `exit`, vat termination, crank abort and remote disconnect against a kernel with auditing on, and after every crank assert these invariants:

- The stored refcounts equal the audit's.
- Reachable ≤ recognizable, and no count is negative.
- Every unresolved promise has exactly one decider or none, and only that decider has resolved it.
- No c-list entry points to a deleted kref.
- Rolling back `delivery` leaves the store byte-identical to its state before the delivery.

That gives correctness evidence across the whole state space, beyond what the example-based tests under `src/**/*.test.ts` cover. A deterministic seed makes failures reproducible.

### 7. Write the invariants down in one place

The invariants are currently spread across JSDoc comments (for example, the `incrementRefCount` block and the `#processCrankResult` ordering comments). Collect them into a `docs/kernel-invariants.md` (or a section of `kernel-guide.md`), with a numbered ID for each. Reference the IDs from the code that maintains each invariant (`// maintains INV-3`) and from the test that checks it. Reviewers can then confirm every invariant has both an enforcer and a test.

### 8. Make the KV schema typed

The store is a flat string→string KV with key prefixes. `kernel-ui`'s `parseObjectRegistry` (CC 45) and `refcount-audit` (`ctx.kv.get(`${kpid}.value`)`) both build and parse keys themselves. Export a single `keySchema` from `ocap-kernel/src/store` (`parseKey(key) → { kind: 'koOwner'; kref } | …`) and use it everywhere. A schema change then shows up as a type error, not as a silent mismatch.

### 9. Cheap mechanical changes

- Enable ESLint's `complexity` rule at about 15 as a warning, with `max-depth` at 4, so new hot spots get noticed in review. The existing over-threshold functions can be given per-line disables that cite this report.
- Use `assertNever` in every `default` arm of a switch over a closed union (`handleSyscall`, `translateSyscallVtoK`, `handleRemoteMessage`).
- Write `isPrivateAddress` as a CIDR list. It currently fails closed, so a missing range only denies plain `ws://`. Even so, with ranges like 169.254/16, 100.64/10 and IPv4-mapped IPv6 left out, a list makes it obvious what's covered.
- Move the duplicated `evm-wallet-experiment` functions into `src/lib/`.

## Appendix: `ocap-kernel` functions with CC ≥ 10

Paths are relative to `packages/ocap-kernel/src`.

|  CC | Nest | LOC | Location                                                              |
| --: | ---: | --: | --------------------------------------------------------------------- |
|  23 |    6 | 103 | `store/methods/gc.ts:148` `collectGarbage`                            |
|  20 |    4 | 138 | `KernelRouter.ts:231` `#deliverSend`                                  |
|  19 |    3 | 234 | `remotes/kernel/remote-comms.ts:135` `initRemoteIdentity`             |
|  18 |    3 | 114 | `remotes/platform/reconnection-lifecycle.ts:88` `attemptReconnection` |
|  18 |    4 | 143 | `remotes/platform/transport.ts:564` `sendRemoteMessage`               |
|  17 |    2 | 100 | `remotes/kernel/RemoteHandle.ts:1321` `handleRemoteMessage`           |
|  16 |    5 | 146 | `store/methods/refcount-audit.ts:133` `computeExpectedRefCounts`      |
|  15 |    1 |  28 | `utils/network.ts:23` `isPrivateAddress`                              |
|  14 |    1 |  68 | `store/methods/translators.ts:226` `translateSyscallVtoK`             |
|  14 |    2 | 110 | `vats/SubclusterManager.ts:345` `#launchVatsForSubcluster`            |
|  12 |    3 |  55 | `KernelQueue.ts:585` `resolvePromises`                                |
|  12 |    1 |  29 | `garbage-collection/garbage-collection.ts:52` `shouldProcessAction`   |
|  12 |    2 |  43 | `store/utils/parse-ref.ts:17` `parseRef`                              |
|  12 |    1 |  23 | `types.ts:640` (superstruct `define` callback)                        |
|  12 |    3 | 145 | `vats/VatSupervisor.ts:336` `#initVat`                                |
|  12 |    1 | 102 | `vats/VatSyscall.ts:160` `handleSyscall`                              |
|  11 |    4 |  76 | `KernelQueue.ts:130` `#runLoop`                                       |
|  11 |    3 |  67 | `remotes/kernel/RemoteManager.ts:221` `#handleIncarnationChange`      |
|  10 |    3 |  72 | `KernelQueue.ts:345` `#processCrankResult`                            |
|  10 |    4 |  79 | `garbage-collection/garbage-collection.ts:120` `processGCActionSet`   |
|  10 |    3 |  37 | `garbage-collection/gc-handlers.ts:67` `performExportCleanup`         |
|  10 |    3 |  38 | `remotes/platform/connection-factory.ts:98` `constructor`             |
|  10 |    5 |  66 | `remotes/platform/connection-factory.ts:382` `openChannelOnce`        |
|  10 |    1 |  35 | `rpc/platform-services/initializeRemoteComms.ts:73` `implementation`  |
|  10 |    2 |  40 | `store/methods/refcount.ts:146` `decrementRefCount`                   |
|  10 |    2 |  60 | `vats/SubclusterManager.ts:114` `launchSubcluster`                    |
|  10 |    2 |  39 | `vats/VatManager.ts:316` `#stopVat`                                   |
