---
title: Making a StreamEnvelopeKit
group: Documents
category: Guides
---

# makeStreamEnvelopeKit

### Template parameters must be explicitly declared

To ensure proper typescript inference behavior, it is necessary to explicitly declare the template parameters when calling `makeStreamEnvelopeKit`. See the [example](#example) below for the recommended declaration pattern.

### Passing an enum as a template parameter

Due to a [typescript limitation](https://github.com/microsoft/TypeScript/issues/30611) it is not possible to specify an enum as the expected type of a template parameter. Therefore `makeStreamEnvelopeKit` will accept template parameters which are not within its intended bounds; improperly specified template parameters will result in improper typescript inference behavior. See the [example](#example) below for the recommended declaration pattern.

### Example declaration

```ts
import { makeStreamEnvelopeKit } from '@ocap/streams';

// Declare the content types.
type FooContent = {
  a: number;
  b: string;
};

type BarContent = {
  c: boolean;
};

// Specify envelope labels in an enum.
enum EnvelopeLabel {
  Foo = 'foo',
  Bar = 'bar',
}

// Create a string[] from the EnvelopeLabel enum.
const labels = Object.values(EnvelopeLabel);

// Make the StreamEnvelopeKit.
export const myStreamEnvelopeKit = makeStreamEnvelopeKit<
  // Pass the EnvelopeLabel enum as `typeof labels`.
  typeof labels,
  // Specify the content type for each content label.
  {
    // foo matches the value 'foo' of EnvelopeLabel.Foo
    foo: FooContent;
    bar: BarContent;
  }
>({
  // Specify the type guards for each envelope label.
  foo: (value: unknown): value is FooContent =>
    isObject(value) &&
    typeof value.a === 'number' &&
    typeof value.b === 'string',

  // bar matches the value 'bar' of EnvelopeLabel.Bar
  bar: (value: unknown): value is BarContent =>
    isObject(value) && typeof value.c === 'boolean',
});
```

### Enveloper use

The low level enveloping functionality is available via the included `streamEnveloper` and `isStreamEnvelope`.

```ts
// Destructure your new envelope kit.
const { streamEnveloper, isStreamEnvelope } = myStreamEnvelopeKit;

// Wrap some FooContent.
const envelope = streamEnveloper.foo.wrap({
  a: 1,
  b: 'one',
});

// Protect your assumptions with the supplied type guard.
if (isStreamEnvelope(envelope)) {
  // ~~~ Unwrap your envelope right away! ~~~
  const content = streamEnveloper[envelope.label].unwrap(envelope);
}
```

### Handler use

If you know in advance how you plan to handle with your envelopes, you can let a `StreamEnvelopeHandler` do the checking and unwrapping for you.

```ts
// Destructure the maker from the kit.
const { makeStreamEnvelopeHandler } = myStreamEnvelopeKit;

// Declare how you want your envelope labels handled.
const streamEnvelopeHandler = makeStreamEnvelopeHandler(
  {
    // The content type is automatically inferred in the declaration.
    foo: async (content) => {
      await delay(content.a);
      return content.b;
    },
    bar: async (content) => (content.c ? 'yes' : 'no'),
  },
  // The optional errorHandler can throw or return.
  // If unspecified, the default behavior is to throw.
  (reason, value) => {
    if (reason.match(/unexpected value/u)) {
      throw new Error(`[myStreamError] ${reason}`);
    }
    return ['[myStreamWarning]', reason, value];
  },
);

// Read messages from an @ocap/streams Reader.
for await (const newMessage of myStreamReader) {
  // And handle the message.
  await streamEnvelopeHandler
    .handle(newMessage)
    // If the errorHandler throws, you can catch it here.
    .catch(console.error)
    // Otherwise, the promise resolves to the value returned by
    // its appropriate content handler, or by the errorHandler.
    .then(console.log);
}
```
