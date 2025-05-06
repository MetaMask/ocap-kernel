# OCAP Kernel Guide

The OCAP Kernel is a powerful object capability-based system that enables secure, isolated execution of JavaScript code in vats (similar to secure sandboxes). This guide will help you understand how to set up, configure, and use the OCAP Kernel.

## Table of Contents

- [Architecture](#architecture)
- [Setting Up the Kernel](#setting-up-the-kernel)
  - [Browser Environment](#browser-environment)
  - [Node.js Environment](#nodejs-environment)
- [Vat Bundles](#vat-bundles)
- [Cluster Configuration](#cluster-configuration)
- [Kernel API](#kernel-api)
- [Common Use Cases](#common-use-cases)
- [Endo Integration](#endo-integration)
- [Example Implementation](#example-implementation)
  - [Browser Example](#browser-example)
  - [Node.js Example](#nodejs-example)
- [Development Tools](#development-tools)
  - [API Documentation](#api-documentation)
  - [CLI Tools](#cli-tools)
  - [Testing](#testing)
  - [Debugging](#debugging)

## Architecture

The OCAP Kernel consists of several key components:

- **Kernel**: The core component that manages vats, messages, and state persistence
- **Vats**: Isolated execution environments for running JavaScript code
- **VatWorkerClient**: Interface for creating and communicating with vat workers
- **KernelDatabase**: Storage system for persisting kernel state

## Setting Up the Kernel

To initialize the OCAP Kernel, you need the following components:

1. A message stream for communication with the kernel
2. A vat worker client to manage vat instances
3. A kernel database for state persistence

### Browser Environment

Here's a basic example for browser environments:

```typescript
import { Kernel } from '@metamask/ocap-kernel';
import { makeSQLKernelDatabase } from '@metamask/kernel-store/sqlite/wasm';
import { MessagePortDuplexStream } from '@metamask/streams/browser';

// Initialize kernel dependencies
const vatWorkerClient = YourVatWorkerClient.make();
const kernelDatabase = await makeSQLKernelDatabase({
  dbFilename: 'store.db',
});

// Create a message stream for communicating with the kernel
const kernelStream = await MessagePortDuplexStream.make(
  messagePort,
  isJsonRpcCall,
);

// Initialize the kernel
const kernel = await Kernel.make(
  kernelStream,
  vatWorkerClient,
  kernelDatabase,
  {
    resetStorage: false, // Set to true to reset storage on startup
  },
);
```

### Node.js Environment

For Node.js environments, you can use the provided utility function:

```typescript
import { makeKernel } from '@ocap/nodejs';
import { MessageChannel } from 'node:worker_threads';

// Create a message channel for kernel communication
const { port1: kernelPort } = new MessageChannel();

// Initialize the kernel with Node.js-specific components
const kernel = await makeKernel({
  port: kernelPort,
  workerFilePath: './path/to/vat-worker.js', // Optional: Path to worker implementation
  resetStorage: false, // Optional: Reset storage on startup
  dbFilename: 'store.db', // Optional: Database file location
});
```

Alternatively, you can manually set up the Node.js components:

```typescript
import { Kernel } from '@metamask/ocap-kernel';
import { makeSQLKernelDatabase } from '@metamask/kernel-store/sqlite/nodejs';
import { NodeWorkerDuplexStream } from '@metamask/streams';
import { MessageChannel, MessagePort } from 'node:worker_threads';
import { NodejsVatWorkerManager } from '@ocap/nodejs';

// Create a message port for kernel communication
const { port1: kernelPort } = new MessageChannel();

// Create a Node.js stream for communication
const nodeStream = new NodeWorkerDuplexStream(kernelPort);

// Initialize vat worker manager for Node.js
const vatWorkerClient = new NodejsVatWorkerManager({
  workerFilePath: './path/to/vat-worker.js',
});

// Initialize kernel database with Node.js SQLite implementation
const kernelDatabase = await makeSQLKernelDatabase({
  dbFilename: 'store.db',
});

// Create and start the kernel
const kernel = await Kernel.make(nodeStream, vatWorkerClient, kernelDatabase, {
  resetStorage: false,
});
```

## Vat Bundles

Vats execute JavaScript code bundled into a specific format. To create a vat bundle:

1. Write your vat code with a root object that exports methods
2. Bundle the code using the `@ocap/cli` with `yarn ocap bundle ./path/to/vat.js`

Example vat code:

```typescript
export function buildRootObject(vatPowers, vatParameters) {
  const { name } = vatParameters;

  return {
    greet() {
      vatPowers.stdout(`Hello from ${name}!`);
      return `Greeting from ${name}`;
    },

    async processMessage(message) {
      vatPowers.stdout(`${name} received: ${message}`);
      return `${name} processed: ${message}`;
    },
  };
}
```

## Cluster Configuration

Vats are organized into clusters, which are defined using a configuration object. A cluster configuration specifies:

1. Which vats to launch
2. Where to find their bundles
3. Parameters to pass to each vat
4. The bootstrap vat (entry point)

Example cluster configuration:

```json
{
  "bootstrap": "alice",
  "forceReset": true,
  "vats": {
    "alice": {
      "bundleSpec": "http://localhost:3000/sample-vat.bundle",
      "parameters": {
        "name": "Alice"
      }
    },
    "bob": {
      "bundleSpec": "http://localhost:3000/sample-vat.bundle",
      "parameters": {
        "name": "Bob"
      }
    }
  }
}
```

The `bundleSpec` can be:

- A URL to a bundle file (e.g., `http://localhost:3000/sample-vat.bundle`)
- A file path for Node.js (e.g., `file:///path/to/sample-vat.bundle`)
- A data URL containing the bundle content

## Kernel API

The kernel exposes several methods for managing vats and sending messages:

### Launching Vats and Clusters

```typescript
// Launch a single vat
const vatId = await kernel.launchVat({
  bundleSpec: 'http://localhost:3000/my-vat.bundle',
  parameters: { name: 'MyVat' },
});

// Launch a cluster of vats
const result = await kernel.launchSubcluster(clusterConfig);
```

### Sending Messages

```typescript
// Get a vat's root Ref object from the store with vatId
const target = kernelStore.getRootObject(vatId);
// Queue a message to a vat
const result = await kernel.queueMessage(
  target, // Object reference
  'greet', // Method name
  [], // Arguments
);

// Parse the result
import { kunser } from '@metamask/ocap-kernel';
const parsedResult = kunser(result);
```

### Vat Management

```typescript
// Ping a vat
await kernel.pingVat(vatId);

// Terminate a vat
await kernel.terminateVat(vatId);

// Restart a vat
await kernel.restartVat(vatId);

// Terminate all vats
await kernel.terminateAllVats();

// Collect garbage
await kernel.collectGarbage();
```

### State Management

```typescript
// Clear kernel state
await kernel.clearState();

// Get kernel status
const status = await kernel.getStatus();

// Update cluster configuration
await kernel.updateClusterConfig(newClusterConfig);

// Reload configuration
await kernel.reloadConfig();
```

## Common Use Cases

### Creating a New Vat

1. Write your vat code
2. Bundle it with `yarn ocap bundle ./path/to/vat.js`
3. Create a vat configuration
4. Launch the vat with `kernel.launchVat()`

### Communication Between Vats

1. Get a reference to an object in another vat
2. Send messages to that reference using `kernel.queueMessage()`
3. Handle responses in your vat code

### Persistence

The kernel automatically persists state using the provided database. To handle persistence in your vat:

1. Ensure important state is attached to the root object or referenced objects
2. The kernel will automatically save and restore this state

## Endo Integration

The OCAP Kernel builds on the [Endo project](https://github.com/endojs/endo), which provides core object capability patterns and tools. Understanding these fundamental concepts is essential for effective vat development.

### Object Capability Model

Vats use Endo's implementation of the object capability security model:

```typescript
import { Far } from '@endo/marshal';
import { harden } from '@endo/ses';

// Creating a capability-based object with Far
const service = Far('service', {
  performAction() {
    return 'result';
  },
});

// Hardening objects to prevent tampering
const config = harden({ key: 'value' });
```

### Eventual Sends

Vats communicate using eventual sends for asynchronous message passing:

```typescript
// E(target).method() is an "eventual send"
// The message goes into the kernel message queue for delivery
const resultPromise = E(otherVat).fetchData();
```

### Further Resources

For more detailed information about the technology underlying the OCAP Kernel:

- [Endo Documentation](https://github.com/endojs/endo/blob/master/README.md)
- [SES (Secure ECMAScript)](https://github.com/endojs/endo/tree/master/packages/ses)
- [Object Capability Model](https://en.wikipedia.org/wiki/Object-capability_model)
- [Agoric Documentation](https://docs.agoric.com/) (Endo is based on technology developed for Agoric)

## Example Implementation

### Browser Example

Here's a complete example of setting up a kernel in a browser environment:

```typescript
import { Kernel, ClusterConfigStruct } from '@metamask/ocap-kernel';
import { makeSQLKernelDatabase } from '@metamask/kernel-store/sqlite/wasm';
import { fetchValidatedJson } from '@metamask/kernel-utils';
import { ExtensionVatWorkerClient } from './VatWorkerClient';
import { MessagePortDuplexStream } from '@metamask/streams/browser';

async function main() {
  // Create a message port for communication
  const port = await receiveMessagePort(
    (listener) => globalThis.addEventListener('message', listener),
    (listener) => globalThis.removeEventListener('message', listener),
  );

  // Create a message stream
  const kernelStream = await MessagePortDuplexStream.make(port, isJsonRpcCall);

  // Initialize kernel dependencies
  const vatWorkerClient = ExtensionVatWorkerClient.make(
    globalThis as PostMessageTarget,
  );

  const kernelDatabase = await makeSQLKernelDatabase({
    dbFilename: 'store.db',
  });

  const resetStorage = true; // For development purposes

  // Initialize the kernel
  const kernel = await Kernel.make(
    kernelStream,
    vatWorkerClient,
    kernelDatabase,
    {
      resetStorage,
    },
  );

  // Fetch and validate cluster configuration
  const clusterConfig = await fetchValidatedJson(
    'path/to/cluster-config.json',
    ClusterConfigStruct,
  );

  // Launch the cluster
  const result = await kernel.launchSubcluster(clusterConfig);
  console.log(`Subcluster launched: ${JSON.stringify(result)}`);
}
```

### Node.js Example

Here's how to set up the kernel in a Node.js application:

```typescript
import { makeKernel } from '@ocap/nodejs';
import { Kernel, ClusterConfigStruct } from '@metamask/ocap-kernel';
import { fetchValidatedJson } from '@metamask/kernel-utils';
import { MessageChannel } from 'node:worker_threads';
import fs from 'node:fs/promises';

async function main() {
  // Create a message channel for kernel communication
  const { port1: kernelPort } = new MessageChannel();

  // Initialize the kernel
  const kernel = await makeKernel({
    port: kernelPort,
    workerFilePath: './path/to/vat-worker.js',
    resetStorage: true, // For development purposes
    dbFilename: ':memory:', // Use in-memory database for testing
  });

  // Load cluster configuration
  const configRaw = await fs.readFile('./path/to/cluster-config.json', 'utf8');
  const clusterConfig = ClusterConfigStruct.check(JSON.parse(configRaw));

  // Launch the cluster
  const result = await kernel.launchSubcluster(clusterConfig);
  console.log(`Subcluster launched: ${JSON.stringify(result)}`);
}

main().catch(console.error);
```

## Development Tools

The OCAP Kernel project includes several useful tools for development:

### API Documentation

The project uses TypeDoc to generate API documentation from source code comments. To build and view the API documentation:

```bash
# Build documentation for all packages
yarn build:docs

# Build documentation for a specific package
yarn workspace @metamask/ocap-kernel build:docs
```

This will generate documentation in the `docs` directory of each package. To view the documentation:

1. Navigate to the `docs` directory of the desired package
2. Open `index.html` in your browser

Each package has its own TypeDoc configuration in a `typedoc.json` file that specifies:

```json
{
  "entryPoints": ["./src/index.ts"],
  "excludePrivate": true,
  "hideGenerator": true,
  "out": "docs",
  "tsconfig": "./tsconfig.build.json"
}
```

For a comprehensive overview of the API:

1. Look at the entry point files in each package (usually `src/index.ts`)
2. Review the TypeDoc-generated documentation for detailed API references
3. Check the test files (e.g., `*.test.ts`) for usage examples

### CLI Tools

The `@ocap/cli` package provides tools for working with vat bundles:

```bash
# Bundle a vat file
yarn ocap bundle ./path/to/vat.js

# Run a local development server for testing
yarn ocap serve ./path/to/bundles
```

### Testing

For testing vats and kernel integration, the project uses Vitest:

```typescript
import { makeKernel } from '@ocap/nodejs';
import { MessageChannel } from 'node:worker_threads';
import { describe, it, expect } from 'vitest';

describe('My vat tests', () => {
  it('should process messages correctly', async () => {
    // Set up a test kernel
    const { port1: kernelPort } = new MessageChannel();
    const kernel = await makeKernel({
      port: kernelPort,
      resetStorage: true,
      dbFilename: ':memory:',
    });

    // Launch your test vat
    const vatId = await kernel.launchVat({
      bundleSpec: 'file:///path/to/test-vat.bundle',
      parameters: { testMode: true },
    });

    // Send a test message
    const rootRef = kernel.getRootObject(vatId);
    const result = await kernel.queueMessage(rootRef, 'testMethod', [
      'test arg',
    ]);

    // Verify the result
    expect(result).toStrictEqual(expectedResult);
  });
});
```

### Debugging

For debugging issues with vats or message passing:

1. Enable verbose logging in your vats using `vatPowers.stdout()`
2. Use the kernel's status API to check the state: `const status = await kernel.getStatus()`
3. For persistent data issues, examine the database directly: `const result = kernelDatabase.executeQuery('SELECT * FROM kv')`

---

By following this guide, you should now have a good understanding of how to set up, configure, and use the OCAP Kernel in both browser and Node.js environments. For more details, refer to the API documentation or the example implementations in the codebase.
