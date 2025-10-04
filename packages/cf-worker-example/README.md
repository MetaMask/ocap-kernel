# Cloudflare Worker with Ocap Kernel Example

This package demonstrates running an Ocap Kernel in a Cloudflare Worker with D1 database persistence and a counter vat using data URI bundles.

## What This Example Shows

This example demonstrates:

1. **Kernel Initialization**: Starting an Ocap Kernel in a Cloudflare Worker environment
2. **D1 Persistence**: Using Cloudflare's D1 database for persistent storage with a write-behind cache
3. **Vat Bundles as Data URIs**: Embedding vat bundles directly in the worker code for fast loading
4. **Vat Launch and Messaging**: Launching a vat and calling methods on it using the kernel API
5. **State Persistence**: Using baggage for vat state that persists across requests and restarts

## How It Works

The worker:

1. Initializes a D1 database backend with write-behind caching
2. Creates a MessageChannel to communicate with the kernel
3. Starts the kernel with the D1 database
4. Launches a counter vat using an embedded data URI bundle
5. Calls methods on the counter vat (`getCount`, `increment`)
6. Uses `kunser()` to deserialize results from the kernel's CapData format
7. Returns the vat's state and demonstrates persistence

## Running the Example

```bash
# From the repo root, first build the CLI tools
yarn build

# Then navigate to this package
cd packages/cf-worker-example

# Build the worker (bundles the vat and embeds it as a data URI)
yarn build

# Start the development server
yarn dev

# In another terminal, test it
curl http://localhost:8788
```

Each request will:
- Launch the counter vat (on first request) or reuse it (on subsequent requests)
- Get the current count from vat state (stored in baggage)
- Increment the counter
- Return the before/after counts, demonstrating persistence

## Response Format

```json
{
  "bootstrap": "CFWorkerCounter initialized with count: 0",
  "counterRef": "ko3",
  "vatCountBefore": 0,
  "vatCountAfter": 1,
  "requestCount": 5,
  "message": "Counter vat launched and incremented!",
  "timestamp": "2025-10-04T12:34:56.789Z"
}
```

The `vatCountAfter` will increment with each request, persisting in D1 via baggage. The `requestCount` tracks total requests to the worker.

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│              Cloudflare Worker                          │
│                                                         │
│  ┌──────────┐         ┌────────────────┐               │
│  │ Fetch    │────────▶│ Kernel         │               │
│  │ Handler  │         │ (Direct API)   │               │
│  └──────────┘         └────────────────┘               │
│                              │                          │
│                              ▼                          │
│                    ┌──────────────────┐                │
│                    │   Counter Vat    │                │
│                    │   (Data URI)     │                │
│                    │   - increment()  │                │
│                    │   - getCount()   │                │
│                    └──────────────────┘                │
│                              │                          │
│                              ▼                          │
│                  ┌────────────────────────┐            │
│                  │ D1 Database            │            │
│                  │ (Write-Behind Cache)   │            │
│                  │ - Kernel state         │            │
│                  │ - Vat state (baggage)  │            │
│                  │ - Request counter      │            │
│                  └────────────────────────┘            │
└─────────────────────────────────────────────────────────┘
```

## Key Components

### Counter Vat (`src/counter-vat.js`)
A simple vat that maintains a counter in baggage (persistent storage):
- `bootstrap()` - Called when the vat is first launched
- `increment(amount)` - Increments the counter
- `getCount()` - Returns the current count
- `reset()` - Resets the counter to 0

### Bundle Process
1. **Bundle**: `yarn ocap bundle src/counter-vat.js` creates `counter-vat.bundle`
2. **Embed**: `generate-bundles.mjs` converts the bundle to a base64 data URI
3. **Import**: Worker imports the data URI from `bundles.ts`

### Kernel API Usage

```typescript
import { kunser, makeKernelStore } from '@metamask/ocap-kernel';

// Launch a subcluster with the vat
const bootstrapResult = await kernel.launchSubcluster({
  bootstrap: 'counter',
  vats: {
    counter: {
      bundleSpec: counterBundleUri, // Data URI
      parameters: { name: 'CFWorkerCounter' }
    }
  }
});

// Get the bootstrap return value
const message = kunser(bootstrapResult); // "CFWorkerCounter initialized..."

// Get the root object reference
const kernelStore = makeKernelStore(database);
const rootRef = kernelStore.getRootObject('v1'); // First vat is 'v1'

// Call methods on the vat
const countResult = await kernel.queueMessage(rootRef, 'getCount', []);
const count = kunser(countResult); // Deserialize to get actual number

const incrementResult = await kernel.queueMessage(rootRef, 'increment', [1]);
const newCount = kunser(incrementResult); // Get new count value
```

## Key Patterns

### 1. Data URI Bundles
Instead of fetching bundles from HTTP, we embed them directly:
- **Pros**: No network requests, instant loading, self-contained
- **Cons**: Larger bundle size (~950KB base64-encoded)
- **Use case**: Small vats, fast cold starts

### 2. Direct Kernel API
We call kernel methods directly (not through JSON-RPC):
```typescript
await kernel.launchSubcluster(config);  // Direct call
await kernel.queueMessage(ref, method, args);  // Direct call
```

### 3. Result Deserialization
Always use `kunser()` to extract actual values from CapData:
```typescript
const rawResult = await kernel.queueMessage(...);
const actualValue = kunser(rawResult); // Get the real JavaScript value
```

### 4. Getting Root Object References
Use `makeKernelStore` to look up root object refs by vat ID:
```typescript
const kernelStore = makeKernelStore(database);
const rootRef = kernelStore.getRootObject('v1'); // First vat
```

## Next Steps

To extend this example:

1. **Add more vat methods**: Extend `counter-vat.js` with new functionality
2. **Multiple vats**: Launch multiple vats in the subcluster and have them communicate
3. **HTTP bundles**: Switch from data URIs to R2 or CDN-hosted bundles for larger vats
4. **Request routing**: Use URL parameters to call different vat methods
5. **Web UI**: Create a simple UI that interacts with the vat

See the [kernel-test package](../kernel-test/src/) for more examples of vats with persistence, communication, and complex state management.
