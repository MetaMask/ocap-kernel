# Usage

## Single provider

When there is only one provider per invocation point, no policy is needed —
the dispatch short-circuits before the policy is ever called. Provide a no-op
policy as a placeholder:

```ts
import { M } from '@endo/patterns';
import { sheafify, makeSection, noopPolicy } from '@metamask/sheaves';

const priceGuard = M.interface('PriceService', {
  getPrice: M.callWhen(M.await(M.string())).returns(M.await(M.number())),
});

const priceSection = makeSection('PriceService', priceGuard, {
  async getPrice(token) {
    return fetchPrice(token);
  },
});

const sheaf = sheafify({
  name: 'PriceService',
  providers: [{ exo: priceSection }],
});

const section = sheaf.getSection({ guard: priceGuard, lift: noopPolicy });
// section is a dispatch section; call it like any capability
const price = await E(section).getPrice('ETH');
```

## Multiple providers with a policy

When more than one candidate matches an invocation, the sheaf calls the policy
to choose. The policy is an `async function*` coroutine that yields candidates
in preference order; it receives accumulated errors as the argument to each
subsequent `.next()` so it can adapt its ranking.

The idiomatic pattern is a generator that `yield*`s candidates filtered by
metadata, expressing priority tiers in source order:

```ts
import { sheafify, constant } from '@metamask/sheaves';
import type { Policy } from '@metamask/sheaves';

type WalletMeta = { mode: 'fast' | 'reliable' };

const preferFast: Policy<WalletMeta> = async function* (candidates) {
  yield* candidates.filter((c) => c.metadata?.mode === 'fast');
  yield* candidates.filter((c) => c.metadata?.mode === 'reliable');
};

const sheaf = sheafify<WalletMeta>({
  name: 'Wallet',
  providers: [
    { exo: fastSection, metadata: constant({ mode: 'fast' }) },
    { exo: reliableSection, metadata: constant({ mode: 'reliable' }) },
  ],
});

// guard restricts which methods callers may invoke
const section = sheaf.getSection({ guard: clientGuard, lift: preferFast });
```

The sheaf drives the generator: it primes it with `gen.next([])`, calls the
chosen candidate, then passes any thrown errors back as `gen.next(errors)` so
the policy can adapt before yielding the next candidate.

Use the `constant` or `callable` helpers to build metadata specs:

```ts
import { constant, callable } from '@metamask/sheaves';

// static value known at construction time
constant({ mode: 'fast' });

// live function evaluated at each dispatch — useful when cost varies by argument,
// e.g. a swap whose metadata encodes volume-based cost tiers
callable((args) => ({ cost: Number(args[0]) > 9000 ? 'high' : 'low' }));
```

## Discoverable sections

`getDiscoverableSection` works like `getSection` but the returned section
exposes its guard — it can be introspected by the caller to discover what
methods and argument shapes it accepts. Use this when the recipient needs to
advertise capability to a third party. It requires a `schema` map describing
each method:

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

The guard is always explicit at the call site — it makes the capability's
scope visible to the reader. When providers are assembled dynamically and the
guard isn't known until after `sheafify` runs, compute the union with
`collectSheafGuard` and pass it in:

```ts
import { collectSheafGuard } from '@metamask/sheaves';

const guard = collectSheafGuard(
  'Wallet',
  providers.map(({ exo }) => exo),
);
const section = sheaf.getSection({ guard, lift });
```

## Remote providers

`makeRemoteSection` wraps a CapTP remote reference as a `Provider`, fetching
the remote's guard once at construction and forwarding all calls via `E()`.
This lets you mix local sections and remote capabilities in the same sheaf:

```ts
import { makeSection, makeRemoteSection, constant } from '@metamask/sheaves';

const remoteProvider = await makeRemoteSection(
  'RemoteWallet', // name for the wrapper section
  remoteCapRef, // CapTP reference
  constant({ mode: 'remote' }), // optional metadata
);

const sheaf = sheafify({
  name: 'Mixed',
  providers: [localProvider, remoteProvider],
});
```

## Policy composition

`@metamask/sheaves` exports helpers for building policies from composable
parts, useful when policy logic would otherwise be duplicated across callers:

```ts
import {
  proxyPolicy,
  withFilter,
  withRanking,
  fallthrough,
} from '@metamask/sheaves';
```

- **`withRanking(comparator)(inner)`** — sort candidates by comparator before
  passing to `inner`
- **`withFilter(predicate)(inner)`** — remove candidates that fail `predicate`
  before passing to `inner`
- **`fallthrough(policyA, policyB)`** — try all candidates from `policyA`
  first; if all fail, try `policyB`
- **`proxyPolicy(gen)`** — forward yielded candidates up and error arrays down
  to an already-started generator; useful when you need to add logic between
  yields (logging, counting, conditional abort). For simple sequential
  composition (`fallthrough`, `withFilter`) you do not need `proxyPolicy` —
  `yield*` forwards `.next(value)` to the delegated iterator automatically.
