# Service discovery — design notes

Design notes for the types in this package, to be read alongside
`~/DiscoveryNotes/discovery.md` (the background essay) and
`~/DiscoveryNotes/discovery-analysis.md` (the analysis of the prior demo).

This package only holds wire-format types, runtime validators, and a small
converter. The actual provider, matcher, and consumer live in their own
packages (to be built in Phases 1–3).

## 1. Registration-token handshake

Provider registration with the matcher is two-sided. It happens in four
steps:

1. **Provider boot.** For each service it publishes, the provider generates
   a fresh opaque `registrationToken` (a random string of sufficient
   entropy) and stores it alongside that service's contact endpoint. The
   token is opaque to the matcher; only the provider knows which endpoint
   issued which token.

2. **Provider → Matcher registration call.** The provider calls one of
   `registerService(description, token)`,
   `registerServiceByUrl(contactUrl, token)`, or
   `registerServiceByRef(contact, token)` on the matcher. (The three forms
   vary only in how the description is communicated; the token is always
   sent.)

3. **Matcher → Provider callback.** Before admitting the description into
   its registry, the matcher calls
   `contact.confirmServiceRegistration(token)` on the service's contact
   endpoint. This closes the loop: if the registration were spoofed by a
   third party that had stolen the contact URL, the real provider would
   not recognize the token and would throw.

4. **Matcher accepts.** If `confirmServiceRegistration` returns normally,
   the matcher adds the description to its registry. Otherwise the
   registration is rejected.

**Token lifecycle.** Tokens are one-shot. After a successful confirmation
the provider may forget the token, since subsequent matcher queries do not
re-present it. If registration is retried (e.g., after a matcher restart),
the provider should generate a fresh token rather than reuse the old one.

**What this does and doesn't protect against.** The handshake prevents
third parties from registering services on a provider's behalf using only a
leaked contact URL. It does not protect against matchers that are
compromised or lie about registrations they've accepted — that problem
belongs to the consumer, who trusts (or doesn't) a given matcher before
querying it.

## 2. `MethodSchema` → `ObjectSpec` / `RemotableSpec` mapping

`@metamask/kernel-utils` defines `MethodSchema` and `JsonSchema` (see
`packages/kernel-utils/src/schema.ts`). `makeDiscoverableExo` uses these to
attach a schema to an exo, queryable via the `GET_DESCRIPTION` sigil.

`TypeSpec` / `ObjectSpec` / `RemotableSpec` in this package are strictly
more expressive than `MethodSchema`: they model `remotable`, `null`,
`void`, `undefined`, `bigint`, `unknown`, and discriminated `union`, none
of which `MethodSchema` represents.

The mapping is implemented in `src/method-schema-convert.ts` and covered
by tests. It is lossy in three ways, all intentional:

- `MethodSchema.args` is an unordered named record; `MethodSpec.parameters`
  is an ordered, unnamed array. The converter emits parameters in the
  iteration order of the `args` record and preserves each parameter's
  name in the `ValueSpec.description` field when the source did not
  supply one. Downstream consumers that positionally match arguments
  must treat this order as authoritative.
- `MethodSchema` has no way to mark an individual argument optional. The
  converter treats every argument as required.
- `JsonSchema` primitives cover only `string | number | boolean`, plus
  `array` and `object`. The converter never emits `null`, `void`,
  `undefined`, `bigint`, `unknown`, `remotable`, or `union`.

Going the other way (`TypeSpec` → `MethodSchema`) would be legitimately
lossy — there is no general way to collapse a `remotable` or a `union`
into `JsonSchema` — so the converter is intentionally one-way.

## 3. Interop with `makeDiscoverableExo`

Today's `makeDiscoverableExo` gives each exo a `GET_DESCRIPTION` sigil
returning a `Record<string, MethodSchema>`. That mechanism is kept as-is.

Phase 1's contact-endpoint construction is expected to work roughly like
this:

```ts
import {
  methodsToRemotableSpec,
  type ServiceDescription,
} from '@ocap/service-discovery-types';

const methods = await E(serviceExo)[GET_DESCRIPTION](); // existing API
const apiSpec: ObjectSpec = {
  properties: {
    service: {
      type: {
        kind: 'remotable',
        spec: methodsToRemotableSpec({
          methods,
          description: 'signs messages with a MetaMask wallet',
        }),
      },
    },
  },
};

const description: ServiceDescription = {
  apiSpec,
  description:
    'A capability that lists wallet accounts and signs personal messages.',
  contact: [{ contactType: 'public', contactUrl }],
};
```

That is: the existing discoverable-exo schema is wrapped as a single
`remotable`-typed property of a top-level `ObjectSpec`. No changes to
`@metamask/kernel-utils` are required.

### On `apiSpec: ObjectSpec` vs `RemotableSpec`

`ServiceDescription.apiSpec` is typed as `ObjectSpec`, not
`RemotableSpec`. That's deliberate: it lets a service advertise a bundle
of several remotables, plain data, or a mix, without forcing every
service to be a single remotable. A single-remotable service fits by
wrapping the remotable in an `ObjectSpec` with one property (as in the
example above). When we encounter ergonomic problems with this shape
during Phase 1 we may revisit it.
