# Queue-based Language Model Service (Testing Utility)

[`makeQueueService`](./service.ts) is a testing utility that creates a `LanguageModelService` implementation for use in tests. It provides a queue-based language model where responses are manually queued using the `push()` method and consumed by `sample()` calls.

## Usage

1. Create a service using `makeQueueService()`
2. Create a model instance using `makeInstance()`
3. Queue responses using `push()` on the model instance
4. Consume responses by calling `sample()`

Note that `makeInstance` and `sample` ignore their arguments, but expect them nonetheless.

## Examples

### Basic Example

```typescript
import { makeQueueService } from '@ocap/kernel-language-model-service/test-utils';

const service = makeQueueService();
const model = await service.makeInstance({ model: 'test' });

// Queue a response
model.push('Hello, world!');

// Consume the response
const result = await model.sample({ prompt: 'Say hello' });
for await (const chunk of result.stream) {
  console.log(chunk.response); // 'Hello, world!'
}
```

### Multiple Queued Responses

```typescript
const service = makeQueueService();
const model = await service.makeInstance({ model: 'test' });

// Queue multiple responses
model.push('First response');
model.push('Second response');

// Each sample() call consumes the next queued response
const first = await model.sample({ prompt: 'test' });
const second = await model.sample({ prompt: 'test' });

// Process streams...
```
