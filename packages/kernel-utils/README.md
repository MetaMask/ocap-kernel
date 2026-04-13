# `utils`

Ocap Kernel utilities.

## Installation

`yarn add @metamask/kernel-utils`

or

`npm install @metamask/kernel-utils`

## SES/Lockdown Compatibility

This package is designed to run under [SES](https://github.com/endojs/endo/tree/master/packages/ses) (Secure ECMAScript lockdown). Some of its dependencies require patches to work in a locked-down environment. The required patch files are included in the `patches/` directory of this package and are applied automatically via the `postinstall` script using [`patch-package`](https://github.com/ds300/patch-package).

Add `patch-package` as a development dependency of your project:

```sh
yarn add --dev patch-package
```

or

```sh
npm install --save-dev patch-package
```

## Sheaf Module

The sheaf module provides a dispatch abstraction for routing method calls across multiple capability objects (_sections_) that each cover a region of a shared interface.

### Overview

```
sheafify({ name, sections, compartment? }) → Sheaf
sheaf.getGlobalSection({ lift }) → section proxy
sheaf.getSection({ guard, lift }) → section proxy
```

Each call on the proxy is dispatched to whichever section covers that method. When multiple sections are eligible, a **lift** selects among them. A lift is an `AsyncGenerator` coroutine that yields candidates one at a time and receives the accumulated error history on each resume — enabling retry, fallback, and cost-aware routing without callers needing to know the selection strategy.

### Defining sections

```ts
import { sheafify, constant, callable } from '@metamask/kernel-utils';

const sheaf = sheafify({
  name: 'Wallet',
  sections: [
    {
      exo: walletA,
      metadata: constant({ cost: 10, push: false }),
    },
    {
      exo: walletB,
      // callable metadata is evaluated per-call with the actual arguments
      metadata: callable((args) => ({ cost: 1 + 0.1 * (args[0] as number) })),
    },
    {
      exo: walletC,
      // source metadata is compiled once at sheafify time via the compartment
      metadata: source(`(args) => ({ cost: 5 + 0.01 * args[0] })`),
    },
  ],
  compartment, // required only when using source-kind metadata
});
```

**Metadata kinds:**
| Kind | When evaluated | Use case |
|------|---------------|----------|
| `constant(v)` | Never (static) | Fixed priority or capability flags |
| `callable(fn)` | Each call | Arg-dependent cost, remaining spend |
| `source(str)` | Each call (compiled at construction) | Sandboxed cost functions |

### Writing a lift

A lift receives `EvaluatedSection<Partial<M>>[]` (germs) and a context, and yields candidates in preference order. It receives a snapshot of all accumulated errors on each `gen.next(errors)` call.

```ts
import type { Lift } from '@metamask/kernel-utils';

// Yield cheapest section first; fall back in cost order on failure
const cheapest: Lift<{ cost: number }> = async function* (germs) {
  yield* [...germs].sort(
    (a, b) => (a.metadata?.cost ?? Infinity) - (b.metadata?.cost ?? Infinity),
  );
};

const section = sheaf.getGlobalSection({ lift: cheapest });
```

### Composing lifts

```ts
import {
  withFilter,
  withRanking,
  fallthrough,
  proxyLift,
} from '@metamask/kernel-utils';

// Filter out sections with insufficient remaining spend
const spendable = withFilter<Cost>(
  (germ, { args }) =>
    (germ.metadata?.remainingSpend ?? Infinity) >= (args[0] as number),
);

// Sort by cost before passing to the inner lift
const byCost = withRanking<Cost>(
  (a, b) => (a.metadata?.cost ?? Infinity) - (b.metadata?.cost ?? Infinity),
);

// Try local sections first, fall through to remote on exhaustion
const withFallback = fallthrough(localLift, remoteLift);

// Compose: filter → rank → select
const lift = spendable(byCost(cheapest));
```

`withFilter` and `withRanking` are pure input transforms that return the inner lift's generator directly. `fallthrough` sequences two lifts via `yield*`, which forwards the error array to each inner lift. `proxyLift` is the primitive for adding logic (logging, circuit-breaking) between yields.

### Error handling

When all candidates are exhausted, `driveLift` throws:

```
Error: No viable section for <method>
  cause: [Error: ..., Error: ..., ...]   // all accumulated attempt errors
```

## Contributing

This package is part of a monorepo. Instructions for contributing can be found in the [monorepo README](https://github.com/MetaMask/ocap-kernel#readme).
