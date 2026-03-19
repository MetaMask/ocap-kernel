# Gator Enforcers and Endo Patterns

This document maps the constraint surface of [MetaMask Delegation Framework
("Gator")](https://github.com/MetaMask/delegation-framework) caveat enforcers
onto [Endo](https://github.com/endojs/endo) `M.*` pattern matchers from
`@endo/patterns`, and scopes out what level of integration is achievable.

## Overlap at a glance

For a contract with a completely static ABI:

```
        Endo M.* patterns              Gator enforcers
       ┌────────────────────┐         ┌─────────────────────────┐
       │                    │         │                         │
       │  M.not()           │         │  Stateful:              │
       │  M.neq()           │         │   ERC20Transfer         │
       │  M.gt/gte/lt/      │         │   AmountEnforcer        │
       │   lte() on args    │         │   LimitedCalls          │
       │  M.nat()           │         │   NativeToken           │
       │  M.splitRecord     │         │   TransferAmount        │
       │  M.splitArray      │         │                         │
       │  M.partial     ┌────────────────────────┐              │
       │  M.record      │      SHARED            │              │
       │  M.array       │                        │              │
       │                │  Literal/eq pinning    │              │
       │                │  AND (conjunction)     │              │
       │                │  OR  (disjunction)     │              │
       │                │  Unconstrained         │              │
       │                │   (any/string/scalar)  │              │
       │                │  Temporal:             │              │
       │                │   Timestamp            │              │
       │                │   BlockNumber          │              │
       │                └────────────────────────┘              │
       │                    │            │                      │
       └────────────────────┘            └──────────────────────┘

  Endo-only: negation,       Shared: equality,        Gator-only: stateful
  range checks on args,      logic operators,         tracking, execution
  structural patterns,       unconstrained,           envelope, (target,
  dynamic ABI types          temporal constraints     selector, value)
                         (feasibly)
```

## Background

A **delegation** in Gator authorizes a delegate to execute transactions on
behalf of a delegator, subject to **caveats**. Each caveat is an on-chain
enforcer contract that validates some property of the execution (target,
calldata, value, etc.) before it proceeds.

An **interface guard** in Endo is a local (in-process) contract that validates
method calls on an exo object. `M.*` patterns describe the shape of arguments
and return values.

The two systems operate at different layers:

- Gator enforcers: on-chain, per-execution, byte-level calldata validation
- Endo patterns: in-process, per-method-call, structured value validation

The goal is to derive Endo interface guards from Gator caveat configurations so
that the local exo twin rejects calls that would inevitably fail on-chain,
giving callers fast, descriptive errors without paying gas.

## The AllowedCalldataEnforcer

The key bridge between the two worlds is `AllowedCalldataEnforcer`. It validates
that a byte range of the execution calldata matches an expected value:

```
terms = [32-byte offset] ++ [expected bytes]
```

For a function with a static ABI, every argument occupies a fixed 32-byte slot
at a known offset from the start of calldata (after the 4-byte selector):

| Arg index | Offset  |
| --------- | ------- |
| 0         | 4       |
| 1         | 36      |
| 2         | 68      |
| n         | 4 + 32n |

This means you can independently constrain any argument by stacking multiple
`allowedCalldata` caveats with different offsets.

### Current integration

`makeDelegationTwin` reads `allowedCalldata` entries from `caveatSpecs` and
narrows the exo interface guard accordingly. Currently this is used to pin
the first argument (recipient/spender address) of `transfer`/`approve` to a
literal value.

## M.\* to Gator enforcer mapping

### Direct mappings (static ABI types)

| M.\* pattern                                                  | Gator enforcer                        | Notes                                                                                                                                                |
| ------------------------------------------------------------- | ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `"literal"` (string/bigint/number passed directly as pattern) | `AllowedCalldataEnforcer`             | Pin a 32-byte slot to the ABI encoding of the literal value. Works for address, uint256, bool, bytes32, and other static types.                      |
| `M.string()`                                                  | _(no enforcer)_                       | Accepts any string. No calldata constraint needed; this is the default/unconstrained case.                                                           |
| `M.scalar()`                                                  | _(no enforcer)_                       | Accepts any scalar (string, number, bigint, etc.). Unconstrained.                                                                                    |
| `M.any()`                                                     | _(no enforcer)_                       | Accepts anything. Unconstrained.                                                                                                                     |
| `M.lte(n)`                                                    | `ValueLteEnforcer`                    | **Only for the `value` field of the execution envelope**, not for calldata args. There is no per-argument LTE enforcer.                              |
| `M.gte(n)`, `M.gt(n)`, `M.lt(n)`                              | **No enforcer**                       | Gator has no general-purpose comparison enforcers for calldata arguments.                                                                            |
| `M.or(p1, p2, ...)`                                           | `LogicalOrWrapperEnforcer`            | Groups of caveats with OR semantics. Each group is a conjunction; the redeemer picks which group to satisfy. See caveats below.                      |
| `M.and(p1, p2, ...)`                                          | Multiple caveats on same delegation   | Caveats are AND-composed by default: every enforcer must pass.                                                                                       |
| `M.not(p)`                                                    | **No enforcer**                       | No negation primitive in Gator.                                                                                                                      |
| `M.eq(v)`                                                     | `AllowedCalldataEnforcer`             | Same as literal pinning.                                                                                                                             |
| `M.neq(v)`                                                    | **No enforcer**                       | No negation/inequality.                                                                                                                              |
| `M.nat()`                                                     | **No enforcer**                       | Non-negative bigint. No range-check enforcer for calldata args.                                                                                      |
| `M.boolean()`                                                 | `AllowedCalldataEnforcer` (partially) | Could pin to `0` or `1` via two `LogicalOrWrapper` groups, but this is a degenerate use. In practice, leave unconstrained or pin to a specific bool. |
| `M.bigint()`                                                  | _(no enforcer)_                       | Type-level only; any uint256 passes.                                                                                                                 |
| `M.number()`                                                  | _(no enforcer)_                       | Type-level only.                                                                                                                                     |
| `M.record()` / `M.array()`                                    | **Not applicable**                    | ABI calldata for dynamic types uses offset indirection. See limitations below.                                                                       |

### Execution-envelope-level mappings

These constrain the execution itself, not individual calldata arguments:

| Constraint                 | Gator enforcer                      | M.\* equivalent                            |
| -------------------------- | ----------------------------------- | ------------------------------------------ |
| Allowed target contracts   | `AllowedTargetsEnforcer`            | (not an arg guard; structural)             |
| Allowed function selectors | `AllowedMethodsEnforcer`            | (not an arg guard; method-level)           |
| Max native value per call  | `ValueLteEnforcer`                  | `M.lte(n)` on the `value` field            |
| Cumulative ERC-20 amount   | `ERC20TransferAmountEnforcer`       | (stateful; tracked on-chain)               |
| Cumulative native amount   | `NativeTokenTransferAmountEnforcer` | (stateful; tracked on-chain)               |
| Exact calldata match       | `ExactCalldataEnforcer`             | Equivalent to pinning ALL args as literals |
| Exact execution match      | `ExactExecutionEnforcer`            | Pin target + value + all calldata          |
| Call count limit           | `LimitedCallsEnforcer`              | (stateful; no M.\* equivalent)             |
| Time window                | `TimestampEnforcer`                 | (temporal; no M.\* equivalent)             |

## What works well

For a contract with a **completely static ABI** (all arguments are fixed-size
types like address, uint256, bool, bytes32):

1. **Literal pinning** (`M.eq` / literal patterns): Fully supported via
   `AllowedCalldataEnforcer`. Each pinned argument is one caveat.

2. **Conjunction** (`M.and`): Naturally expressed as multiple caveats on the
   same delegation.

3. **Disjunction** (`M.or`): Supported via `LogicalOrWrapperEnforcer`, but
   with an important security caveat: the **redeemer** chooses which group to
   satisfy, so all groups must represent equally acceptable outcomes.

4. **Unconstrained args** (`M.string()`, `M.any()`, `M.scalar()`): Simply
   omit the enforcer for that argument slot.

## What does NOT map

1. **Inequality / range checks on calldata args**: `M.gt(n)`, `M.gte(n)`,
   `M.lt(n)`, `M.lte(n)`, `M.nat()` have no calldata-level enforcer.
   `ValueLteEnforcer` only constrains the execution's `value` field (native
   token amount), not encoded function arguments. A custom enforcer contract
   would be needed.

2. **Negation**: `M.not(p)`, `M.neq(v)` have no on-chain equivalent. Gator
   enforcers are allowlists, not denylists.

3. **Dynamic ABI types**: `string`, `bytes`, arrays, and nested structs use
   ABI offset indirection. The data lives at a variable position in calldata,
   making `AllowedCalldataEnforcer` fragile to use (you'd need to pin the
   offset pointer AND the data AND the length). Not recommended.

4. **Stateful patterns**: `M.*` patterns are stateless. Gator enforcers like
   `ERC20TransferAmountEnforcer`, `LimitedCallsEnforcer`, and
   `NativeTokenTransferAmountEnforcer` maintain on-chain state across
   invocations. These have no M.\* equivalent and are handled separately
   via `CaveatSpec` (e.g., `cumulativeSpend` drives the local `SpendTracker`).

5. **Structural patterns**: `M.splitRecord`, `M.splitArray`, `M.partial` —
   these operate on JS object/array structure that doesn't exist in flat ABI
   calldata.
