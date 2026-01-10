# Plan: Immediate Next Step for Omnium Phase 1

## Context

Looking at the Phase 1 goals in `packages/omnium-gatherum/PLAN.md`, the critical path to achieving a working PoC requires:

1. Install two caplets (service producer and consumer)
2. Service producer can be discovered by consumer
3. Consumer calls methods on producer (e.g., `E(serviceProducer).echo(message)`)
4. Caplets can be uninstalled and the process repeated

**Current Status:**

- ✅ CapletController architecture complete (install/uninstall/list/get)
- ✅ CapTP infrastructure working
- ✅ Dev console integration (`globalThis.omnium`)
- ✅ Unit tests with mocks comprehensive
- ✅ Kernel bundle loading fully functional
- ❌ **BLOCKER**: No actual caplet vat implementations exist
- ❌ Caplet vat contract not documented
- ❌ Integration tests with real vats not written

## Immediate Next Steps (1-2 Commits)

### Step 1: Define Caplet Vat Contract + Create Echo Caplet

**Commit 1: Define contract and create echo-caplet source**

This is identified as "High Priority" and a blocker in PLAN.md line 254. Everything else depends on this.

#### 1.1 Document Caplet Vat Contract

Create `packages/omnium-gatherum/docs/caplet-contract.md`:

**Contract specification:**

- All caplet vats must export `buildRootObject(vatPowers, parameters, baggage)`
- `vatPowers`: Standard kernel vat powers (logger, etc.)
- `parameters`: Bootstrap data from omnium
  - Phase 1: Service krefs passed directly as `{ serviceName: kref }`
  - Phase 2+: Registry vat reference for dynamic discovery
- `baggage`: Persistent state storage (standard Endo pattern)
- Root object must be hardened and returned from `buildRootObject()`
- Services are accessed via `E()` on received krefs

**Phase 1 approach:**

- Services resolved at install time (no runtime discovery)
- Requested services passed in `parameters` object
- Service names from `manifest.requestedServices` map to parameter keys

**Based on existing patterns from:**

- `/packages/kernel-test/src/vats/exo-vat.js` (exo patterns)
- `/packages/kernel-test/src/vats/service-vat.js` (service injection)
- `/packages/kernel-test/src/vats/logger-vat.js` (minimal example)

#### 1.2 Create Echo Caplet Source

Create `packages/omnium-gatherum/src/vats/echo-caplet.ts`:

```typescript
import { makeDefaultExo } from '@metamask/kernel-utils/exo';

/**
 * Echo service caplet - provides a simple echo method for testing
 *
 * @param {VatPowers} vatPowers - Standard vat powers
 * @param {object} parameters - Bootstrap parameters (empty for echo-caplet)
 * @param {MapStore} baggage - Persistent state storage
 * @returns {object} Root object with echo service methods
 */
export function buildRootObject(vatPowers, parameters, baggage) {
  const logger = vatPowers.logger.subLogger({ tags: ['echo-caplet'] });

  logger.log('Echo caplet initializing...');

  return makeDefaultExo('echo-caplet-root', {
    bootstrap() {
      logger.log('Echo caplet bootstrapped');
    },

    /**
     * Echo service method - returns the input message with "Echo: " prefix
     * @param {string} message - Message to echo
     * @returns {string} Echoed message
     */
    echo(message) {
      logger.log('Echoing message:', message);
      return `Echo: ${message}`;
    },
  });
}
```

**Manifest for echo-caplet:**

```typescript
const echoCapletManifest: CapletManifest = {
  id: 'com.example.echo',
  name: 'Echo Service',
  version: '1.0.0',
  bundleSpec: 'file:///path/to/echo-caplet.bundle',
  requestedServices: [], // Echo provides service, doesn't request any
  providedServices: ['echo'],
};
```

#### 1.3 Add Bundle Build Script

Update `packages/omnium-gatherum/package.json`:

```json
{
  "scripts": {
    "build": "yarn build:vats",
    "build:vats": "ocap bundle src/vats"
  }
}
```

This will use `@endo/bundle-source` (via the `ocap` CLI) to generate `.bundle` files.

#### 1.4 Create Test Fixture

Create `packages/omnium-gatherum/test/fixtures/manifests.ts`:

```typescript
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import type { CapletManifest } from '../../src/controllers/caplet/types.js';

const VATS_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../src/vats',
);

export const echoCapletManifest: CapletManifest = {
  id: 'com.example.echo',
  name: 'Echo Service',
  version: '1.0.0',
  bundleSpec: new URL('./echo-caplet.bundle', `file://${VATS_DIR}/`).toString(),
  requestedServices: [],
  providedServices: ['echo'],
};
```

### Step 2: Create Consumer Caplet + Integration Test

**Commit 2: Add consumer-caplet and end-to-end integration test**

#### 2.1 Create Consumer Caplet Source

Create `packages/omnium-gatherum/src/vats/consumer-caplet.ts`:

```typescript
import { E } from '@endo/eventual-send';
import { makeDefaultExo } from '@metamask/kernel-utils/exo';

/**
 * Consumer caplet - demonstrates calling methods on another caplet's service
 *
 * @param {VatPowers} vatPowers - Standard vat powers
 * @param {object} parameters - Bootstrap parameters with service references
 * @param {object} parameters.echo - Echo service kref
 * @param {MapStore} baggage - Persistent state storage
 * @returns {object} Root object with test methods
 */
export function buildRootObject(vatPowers, parameters, baggage) {
  const logger = vatPowers.logger.subLogger({ tags: ['consumer-caplet'] });

  logger.log('Consumer caplet initializing...');

  const { echo: echoService } = parameters;

  if (!echoService) {
    throw new Error('Echo service not provided in parameters');
  }

  return makeDefaultExo('consumer-caplet-root', {
    bootstrap() {
      logger.log('Consumer caplet bootstrapped with echo service');
    },

    /**
     * Test method that calls the echo service
     * @param {string} message - Message to send to echo service
     * @returns {Promise<string>} Result from echo service
     */
    async testEcho(message) {
      logger.log('Calling echo service with:', message);
      const result = await E(echoService).echo(message);
      logger.log('Received from echo service:', result);
      return result;
    },
  });
}
```

**Manifest for consumer-caplet:**

```typescript
export const consumerCapletManifest: CapletManifest = {
  id: 'com.example.consumer',
  name: 'Echo Consumer',
  version: '1.0.0',
  bundleSpec: new URL(
    './consumer-caplet.bundle',
    `file://${VATS_DIR}/`,
  ).toString(),
  requestedServices: ['echo'], // Requests echo service
  providedServices: [],
};
```

#### 2.2 Implement Service Injection in CapletController

**Current gap:** CapletController doesn't yet capture the caplet's root kref or pass services to dependent caplets.

Update `packages/omnium-gatherum/src/controllers/caplet/caplet-controller.ts`:

**Add to `install()` method:**

```typescript
// After launchSubcluster completes:
const subclusterId = /* ... determine subcluster ID ... */;

// Get the root kref for this caplet
// TODO: Need to capture this from launch result or query kernel
const rootKref = /* ... capture from kernel ... */;

// Resolve requested services
const serviceParams: Record<string, unknown> = {};
for (const serviceName of manifest.requestedServices) {
  const provider = await this.getByService(serviceName);
  if (!provider) {
    throw new Error(`Requested service not found: ${serviceName}`);
  }
  // Get provider's root kref and add to parameters
  serviceParams[serviceName] = /* ... provider's kref ... */;
}

// TODO: Pass serviceParams to vat during bootstrap
// This requires kernel support for passing parameters
```

**Note:** This reveals a kernel integration gap - we need a way to:

1. Capture the root kref when a subcluster launches
2. Pass parameters to a vat's bootstrap method

**For Phase 1 PoC, we can work around this by:**

- Manually passing service references via dev console
- Using kernel's `queueMessage()` to send services after launch
- Or: Enhance `launchSubcluster` to return root krefs

#### 2.3 Create Integration Test

Create `packages/omnium-gatherum/test/caplet-integration.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { E } from '@endo/eventual-send';
import { makeCapletController } from '../src/controllers/caplet/caplet-controller.js';
import { echoCapletManifest, consumerCapletManifest } from './fixtures/manifests.js';
import type { BackgroundCapTP } from '@metamask/kernel-browser-runtime';

describe('Caplet Integration', () => {
  let capletController;
  let kernel: BackgroundCapTP['kernel'];

  beforeEach(async () => {
    // Set up real kernel connection
    const omnium = await setupOmnium(); // Helper to initialize omnium
    kernel = await omnium.getKernel();
    capletController = await makeCapletController({
      adapter: /* ... real storage adapter ... */,
      launchSubcluster: (config) => E(kernel).launchSubcluster(config),
      terminateSubcluster: (id) => E(kernel).terminateSubcluster(id),
    });
  });

  afterEach(async () => {
    // Clean up all caplets
    const caplets = await capletController.list();
    for (const caplet of caplets) {
      await capletController.uninstall(caplet.manifest.id);
    }
  });

  it('installs echo-caplet and calls its echo method', async () => {
    // Install echo-caplet
    const { capletId, subclusterId } = await capletController.install(
      echoCapletManifest
    );

    expect(capletId).toBe('com.example.echo');
    expect(subclusterId).toBeDefined();

    // Get echo-caplet from storage
    const installedCaplet = await capletController.get(capletId);
    expect(installedCaplet).toBeDefined();
    expect(installedCaplet?.manifest.name).toBe('Echo Service');

    // TODO: Get root kref for echo-caplet
    // const echoKref = /* ... get from kernel ... */;

    // Call echo method
    // const result = await E(echoKref).echo('Hello, Omnium!');
    // expect(result).toBe('Echo: Hello, Omnium!');
  });

  it('installs both caplets and consumer calls echo service', async () => {
    // Install echo-caplet (service provider)
    const echoResult = await capletController.install(echoCapletManifest);

    // Install consumer-caplet (service consumer)
    // Note: Consumer requests 'echo' service via manifest
    const consumerResult = await capletController.install(consumerCapletManifest);

    // TODO: Get consumer's root kref
    // const consumerKref = /* ... get from kernel ... */;

    // Call consumer's testEcho method
    // const result = await E(consumerKref).testEcho('Test message');
    // expect(result).toBe('Echo: Test message');
  });

  it('uninstalls caplets cleanly', async () => {
    // Install both
    await capletController.install(echoCapletManifest);
    await capletController.install(consumerCapletManifest);

    // Verify both installed
    let list = await capletController.list();
    expect(list).toHaveLength(2);

    // Uninstall consumer first
    await capletController.uninstall('com.example.consumer');
    list = await capletController.list();
    expect(list).toHaveLength(1);

    // Uninstall echo
    await capletController.uninstall('com.example.echo');
    list = await capletController.list();
    expect(list).toHaveLength(0);
  });
});
```

## Critical Files

### To Create

- `packages/omnium-gatherum/docs/caplet-contract.md` - Caplet vat interface documentation
- `packages/omnium-gatherum/src/vats/echo-caplet.ts` - Echo service vat source
- `packages/omnium-gatherum/src/vats/consumer-caplet.ts` - Consumer vat source
- `packages/omnium-gatherum/test/fixtures/manifests.ts` - Test manifest definitions
- `packages/omnium-gatherum/test/caplet-integration.test.ts` - Integration tests

### To Modify

- `packages/omnium-gatherum/package.json` - Add bundle build script
- `packages/omnium-gatherum/src/controllers/caplet/caplet-controller.ts` - Service injection logic

### To Reference

- `/packages/kernel-test/src/vats/exo-vat.js` - Exo pattern examples
- `/packages/kernel-test/src/vats/service-vat.js` - Service injection pattern
- `/packages/kernel-test/src/utils.ts:24-26` - `getBundleSpec()` helper
- `/packages/kernel-test/src/cluster-launch.test.ts` - Real subcluster launch pattern

## Known Gaps Revealed

During implementation, we'll need to address:

1. **Kref Capture** - Need to capture root kref when caplet launches

   - Option A: Enhance `launchSubcluster` to return root krefs
   - Option B: Query kernel status after launch to get krefs
   - Option C: Use `queueMessage` with well-known pattern

2. **Service Parameter Passing** - Need to pass resolved services to vat bootstrap

   - Currently `ClusterConfig` doesn't have a parameters field
   - May need to enhance kernel's `VatConfig` type
   - Or: Pass services via post-bootstrap message

3. **Bundle Build Integration** - Need to run `ocap bundle` as part of build
   - Add to omnium-gatherum build script
   - Ensure bundles are generated before tests run
   - Consider git-ignoring bundles or checking them in

## Verification

After completing both commits:

1. **Build bundles:**

   ```bash
   cd packages/omnium-gatherum
   yarn build:vats
   ```

2. **Run integration tests:**

   ```bash
   yarn test:integration
   ```

3. **Manual dev console test:**

   ```javascript
   // In browser console
   const result = await omnium.caplet.install(echoCapletManifest);
   console.log('Installed:', result);

   const list = await omnium.caplet.list();
   console.log('Caplets:', list);

   await omnium.caplet.uninstall('com.example.echo');
   ```

4. **Verify Phase 1 goals:**
   - ✓ Two caplets can be installed
   - ✓ Service discovery works (hard-coded is acceptable)
   - ✓ Consumer can call provider methods
   - ✓ Caplets can be uninstalled and reinstalled

## Success Criteria

**Commit 1 Complete When:**

- ✓ `docs/caplet-contract.md` exists and documents the interface
- ✓ `src/vats/echo-caplet.ts` compiles successfully
- ✓ Bundle build script works (`yarn build:vats`)
- ✓ `echo-caplet.bundle` file generated
- ✓ Test manifest can reference the bundle

**Commit 2 Complete When:**

- ✓ `src/vats/consumer-caplet.ts` compiles successfully
- ✓ `consumer-caplet.bundle` file generated
- ✓ Integration test file created (even if some tests are pending TODOs)
- ✓ At least one test passes showing caplet installation/uninstallation

**Phase 1 PoC Complete When:**

- ✓ Both caplets install successfully
- ✓ Consumer receives reference to echo service
- ✓ Consumer successfully calls `E(echo).echo(msg)` and gets response
- ✓ Both caplets can be uninstalled
- ✓ Process can be repeated

## Notes

- This is the **highest priority** work according to PLAN.md
- It's marked as a blocker for integration testing
- No kernel changes are required (bundle loading already works)
- We're following established patterns from kernel-test vats
- This unblocks all remaining Phase 1 work

## Alternative Approach

If service parameter passing proves complex, we can start with an even simpler approach:

**Phase 1a: Single Echo Caplet (Commit 1 only)**

- Install echo-caplet only
- Test by calling its methods directly via dev console
- Defer consumer-caplet until service injection is figured out

This still achieves significant progress:

- Validates caplet contract
- Proves bundle loading works end-to-end
- Exercises install/uninstall lifecycle
- Provides foundation for service injection work
