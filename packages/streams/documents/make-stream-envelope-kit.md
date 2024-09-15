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

// Import or declare the content types.
import type { FooContent } from './foo.js';
/*
type FooContent = {
  a: number;
  b: string;
};
*/
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

### Example use

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
