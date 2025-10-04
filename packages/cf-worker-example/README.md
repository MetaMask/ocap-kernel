# Cloudflare Worker with Ocap Kernel Example

This package demonstrates running an Ocap Kernel in a Cloudflare Worker with D1 database persistence.

## What This Example Shows

This example demonstrates:

1. **Kernel Initialization**: Starting an Ocap Kernel in a Cloudflare Worker environment
2. **D1 Persistence**: Using Cloudflare's D1 database for persistent storage with a write-behind cache
3. **JSON-RPC Communication**: Sending commands to the kernel using JSON-RPC over MessageChannel
4. **Persistent State**: Tracking state (a request counter) that persists across worker invocations

## How It Works

The worker:

1. Initializes a D1 database backend with write-behind caching
2. Creates a MessageChannel to communicate with the kernel
3. Starts the kernel with the D1 database
4. Sends a `ping` request to verify the kernel is responding
5. Tracks a request counter in the kernel database that persists in D1
6. Returns the ping result and current request count

## Running the Example

```bash
# From the repo root
cd packages/cf-worker-example

# Start the development server
yarn wrangler dev

# Visit http://localhost:8787 in your browser
```

Each request will:
- Return a successful `ping` response from the kernel
- Increment and persist a request counter in D1
- Show the current count, demonstrating persistence

## Response Format

```json
{
  "ping": "pong",
  "requestCount": 5,
  "message": "Kernel is running with D1 persistence!",
  "timestamp": "2025-10-04T12:34:56.789Z"
}
```

The `requestCount` will increment with each request, persisting across worker invocations thanks to D1.

## Architecture

```
┌─────────────────────────────────────────────┐
│           Cloudflare Worker                 │
│                                             │
│  ┌──────────┐         ┌─────────────────┐  │
│  │ Fetch    │────────▶│ Kernel          │  │
│  │ Handler  │◀────────│ (MessagePort)   │  │
│  └──────────┘         └─────────────────┘  │
│       │                        │            │
│       │                        │            │
│       ▼                        ▼            │
│  ┌──────────────────────────────────────┐  │
│  │   D1 Database (Write-Behind Cache)   │  │
│  │   - Kernel state                     │  │
│  │   - Vat state                        │  │
│  │   - Request counter                  │  │
│  └──────────────────────────────────────┘  │
└─────────────────────────────────────────────┘
```

## Key Components

- **makeD1KernelDatabase**: Creates a write-behind kernel database backed by D1
- **makeKernel**: Initializes the kernel with platform services and database
- **MessageChannel**: Provides communication between controller and kernel
- **JSON-RPC**: Protocol for sending commands and receiving responses

## Next Steps

To extend this example with actual vat functionality:

1. Create a vat bundle with your application code
2. Use `kernel.launchSubcluster()` to start vats
3. Use `kernel.queueMessage()` to send messages to vat objects
4. Vat state will persist in D1 automatically through the kernel database

See the [kernel-test package](../kernel-test/src/persistence.test.ts) for examples of vats with persistent state.

