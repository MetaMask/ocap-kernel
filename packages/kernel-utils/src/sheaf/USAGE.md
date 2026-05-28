# Usage

## Single provider

When there is only one section per invocation point, no lift is needed — the
dispatch short-circuits before the lift is ever called. Provide a no-op lift
as a placeholder:

```ts
import { M } from '@endo/patterns';
import { sheafify, makeSection, noopLift } from '@metamask/kernel-utils';

const priceGuard = M.interface('PriceService', {
  getPrice: M.callWhen(M.await(M.string())).returns(M.await(M.number())),
});

const priceExo = makeSection('PriceService', priceGuard, {
  async getPrice(token) {
    return fetchPrice(token);
  },
});

const sheaf = sheafify({
  name: 'PriceService',
  sections: [{ exo: priceExo }],
});

const section = sheaf.getSection({ guard: priceGuard, lift: noopLift });
// section is a dispatch exo; call it like any capability
const price = await E(section).getPrice('ETH');
```

## Multiple providers with a lift

When the stalk at a given invocation point contains more than one germ, the
sheaf calls the lift to choose. The lift is an `async function*` coroutine that
yields candidates in preference order; it receives accumulated errors as the
argument to each subsequent `.next()` so it can adapt its ranking.

The idiomatic pattern is a generator that `yield*`s candidates filtered by
metadata, expressing priority tiers in source order:

```ts
import { sheafify, constant } from '@metamask/kernel-utils';
import type { Lift } from '@metamask/kernel-utils';

type WalletMeta = { mode: 'fast' | 'reliable' };

const preferFast: Lift<WalletMeta> = async function* (germs) {
  yield* germs.filter((g) => g.metadata?.mode === 'fast');
  yield* germs.filter((g) => g.metadata?.mode === 'reliable');
};

const sheaf = sheafify<WalletMeta>({
  name: 'Wallet',
  sections: [
    { exo: fastExo, metadata: constant({ mode: 'fast' }) },
    { exo: reliableExo, metadata: constant({ mode: 'reliable' }) },
  ],
});

// guard restricts which methods callers may invoke
const section = sheaf.getSection({ guard: clientGuard, lift: preferFast });
```

The sheaf drives the generator: it primes it with `gen.next([])`, calls the
chosen candidate, then passes any thrown errors back as `gen.next(errors)` so
the lift can adapt before yielding the next candidate.

Use the `constant`, `source`, or `callable` helpers to build metadata specs:

```ts
import { constant, source, callable } from '@metamask/kernel-utils';

// static value known at construction time
constant({ mode: 'fast' });

// @experimental — prefer callable unless the function must cross a trust boundary
// or be serialized. Compiled once in the sheaf's compartment at construction time.
source(`(args) => ({ cost: args[0] > 9000 ? 'high' : 'low' })`);

// live function evaluated at each dispatch — useful when cost varies by argument,
// e.g. a swap whose metadata encodes volume-based cost tiers
callable((args) => ({ cost: Number(args[0]) > 9000 ? 'high' : 'low' }));
```

## Discoverable sections

`getDiscoverableSection` works like `getSection` but the returned exo exposes
its guard — it can be introspected by the caller to discover what methods and
argument shapes it accepts. Use this when the recipient needs to advertise
capability to a third party. It requires a `schema` map describing each method:

```ts
import type { MethodSchema } from '@metamask/kernel-utils';

const schema: Record<string, MethodSchema> = {
  getPrice: { description: 'Get the current price of a token.' },
};

const section = sheaf.getDiscoverableSection({
  guard: clientGuard,
  lift,
  schema,
});
```

`getSection` is the non-discoverable variant (no `schema` required).

`getGlobalSection` and `getDiscoverableGlobalSection` derive the guard
automatically from the union of all presheaf sections. They are `@deprecated`
as a nudge toward explicit guards once the caller knows the section set —
explicit guards make the capability's scope visible at the call site. When
sections are assembled dynamically (e.g., rebuilt at runtime from a set of
grants that changes) and the union guard isn't known until after `sheafify`
runs, the global variants are the right choice.

## Remote sections

`makeRemoteSection` wraps a CapTP remote reference as a `PresheafSection`,
fetching the remote's guard once at construction and forwarding all calls via
`E()`. This lets you mix local exos and remote capabilities in the same sheaf:

```ts
import {
  makeSection,
  makeRemoteSection,
  constant,
} from '@metamask/kernel-utils';

const remoteSection = await makeRemoteSection(
  'RemoteWallet', // name for the wrapper exo
  remoteCapRef, // CapTP reference
  constant({ mode: 'remote' }), // optional metadata
);

const sheaf = sheafify({
  name: 'Mixed',
  sections: [localSection, remoteSection],
});
```

## Lift composition

`@metamask/kernel-utils` exports helpers for building lifts from composable
parts, useful when lift logic would otherwise be duplicated across callers:

```ts
import {
  proxyLift,
  withFilter,
  withRanking,
  fallthrough,
} from '@metamask/kernel-utils';
```

- **`withRanking(comparator)(inner)`** — sort germs by comparator before
  passing to `inner`
- **`withFilter(predicate)(inner)`** — remove germs that fail `predicate`
  before passing to `inner`
- **`fallthrough(liftA, liftB)`** — try all candidates from `liftA` first;
  if all fail, try `liftB`
- **`proxyLift(gen)`** — forward yielded candidates up and error arrays down
  to an already-started generator; useful when you need to add logic between
  yields (logging, counting, conditional abort). For simple sequential
  composition (`fallthrough`, `withFilter`) you do not need `proxyLift` —
  `yield*` forwards `.next(value)` to the delegated iterator automatically.
