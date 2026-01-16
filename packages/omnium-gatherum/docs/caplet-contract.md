# Caplet Vat Contract

This document defines the interface that all Caplet vats must implement to work within the Omnium system.

## Overview

A Caplet is a sandboxed application that runs in its own vat (Virtual Address Table) within the kernel. Each Caplet provides services and/or consumes services from other Caplets using object capabilities.

## Core Contract

### buildRootObject Function

All Caplet vats must export a `buildRootObject` function with the following signature:

```javascript
export function buildRootObject(vatPowers, parameters, baggage) {
  // Implementation
  return rootObject;
}
```

#### Parameters

**`vatPowers`**: Object providing kernel-granted capabilities
- `vatPowers.logger`: Structured logging interface
  - Use `vatPowers.logger.subLogger({ tags: ['tag1', 'tag2'] })` to create a namespaced logger
  - Supports `.log()`, `.error()`, `.warn()`, `.debug()` methods
- Other powers as defined by the kernel

**`parameters`**: Bootstrap parameters from Omnium
- Phase 1: Contains service references as `{ serviceName: kref }`
  - Service names match those declared in the Caplet's `manifest.requestedServices`
  - Each requested service is provided as a remote presence (kref)
- Phase 2+: Will include registry vat reference for dynamic service discovery
- May include optional configuration fields

**`baggage`**: Persistent state storage (MapStore)
- Root of the vat's persistent state
- Survives vat restarts and upgrades
- Use for storing durable data

### Root Object

The `buildRootObject` function must return a hardened root object. This object becomes the Caplet's public interface.

**Recommended pattern:**
Use `makeDefaultExo` from `@metamask/kernel-utils/exo`:

```javascript
import { makeDefaultExo } from '@metamask/kernel-utils/exo';

export function buildRootObject(vatPowers, parameters, baggage) {
  const logger = vatPowers.logger.subLogger({ tags: ['my-caplet'] });

  return makeDefaultExo('my-caplet-root', {
    bootstrap() {
      logger.log('Caplet initialized');
    },
    // ... service methods
  });
}
```

### Bootstrap Method (Optional but Recommended)

The root object may expose a `bootstrap` method that gets called during vat initialization:

```javascript
{
  bootstrap() {
    // Initialization logic
    // Access to injected services via parameters
  }
}
```

**For service consumers:**
```javascript
bootstrap(_vats, services) {
  // Phase 1: Services passed directly via parameters
  const myService = parameters.myService;

  // Phase 2+: Services accessed via registry
  const registry = parameters.registry;
  const myService = await E(registry).getService('myService');
}
```

## Service Patterns

### Providing Services

Caplets that provide services should:

1. Declare provided services in `manifest.providedServices: ['serviceName']`
2. Expose service methods on the root object
3. Return hardened results or promises

```javascript
export function buildRootObject(vatPowers, parameters, baggage) {
  const logger = vatPowers.logger.subLogger({ tags: ['echo-service'] });

  return makeDefaultExo('echo-service-root', {
    bootstrap() {
      logger.log('Echo service ready');
    },

    // Service method
    echo(message) {
      logger.log('Echoing:', message);
      return `Echo: ${message}`;
    },
  });
}
```

### Consuming Services

Caplets that consume services should:

1. Declare requested services in `manifest.requestedServices: ['serviceName']`
2. Access services from the `parameters` object
3. Use `E()` from `@endo/eventual-send` for async calls

```javascript
import { E } from '@endo/eventual-send';
import { makeDefaultExo } from '@metamask/kernel-utils/exo';

export function buildRootObject(vatPowers, parameters, baggage) {
  const logger = vatPowers.logger.subLogger({ tags: ['consumer'] });

  // Phase 1: Services passed directly in parameters
  const { echoService } = parameters;

  if (!echoService) {
    throw new Error('Required service "echoService" not provided');
  }

  return makeDefaultExo('consumer-root', {
    bootstrap() {
      logger.log('Consumer initialized with echo service');
    },

    async useService(message) {
      // Call service method using E()
      const result = await E(echoService).echo(message);
      logger.log('Received from service:', result);
      return result;
    },
  });
}
```

## Phase 1 Service Discovery

In Phase 1, service discovery is **static** and happens at install time:

1. Caplet manifest declares `requestedServices: ['serviceName']`
2. Omnium resolves each requested service by looking up providers in storage
3. Omnium retrieves the provider Caplet's root kref
4. Omnium passes the kref to the consumer via `parameters` object
5. Consumer accesses service as `parameters.serviceName`

**Limitations:**
- Services must already be installed before dependent Caplets
- No runtime service discovery or dynamic registration
- Services are bound at install time

**Example flow:**
```javascript
// 1. Install echo-caplet (provides "echo" service)
await omnium.caplet.install(echoManifest);

// 2. Install consumer-caplet (requests "echo" service)
// Omnium automatically resolves and passes echo service kref
await omnium.caplet.install(consumerManifest);
```

## Phase 2+ Service Discovery (Future)

In Phase 2+, service discovery will be **dynamic** via a registry vat:

- All Caplets receive a registry vat reference in `parameters.registry`
- Services can be requested at runtime: `await E(registry).getService('name')`
- Services can be revoked
- More flexible but requires registry vat infrastructure

## Code Patterns

### Using Logger

```javascript
const logger = vatPowers.logger.subLogger({ tags: ['my-caplet', 'feature'] });

logger.log('Informational message', { data: 'value' });
logger.error('Error occurred', error);
logger.warn('Warning message');
logger.debug('Debug info');
```

### Using Baggage (Persistent State)

```javascript
import { makeScalarMapStore } from '@agoric/store';

export function buildRootObject(vatPowers, parameters, baggage) {
  // Initialize persistent store
  if (!baggage.has('state')) {
    baggage.init('state', makeScalarMapStore('caplet-state'));
  }

  const state = baggage.get('state');

  return makeDefaultExo('root', {
    setValue(key, value) {
      state.init(key, value);
    },
    getValue(key) {
      return state.get(key);
    },
  });
}
```

### Using E() for Async Calls

```javascript
import { E } from '@endo/eventual-send';

// Call methods on remote objects (service krefs)
const result = await E(serviceKref).methodName(arg1, arg2);

// Chain promises
const final = await E(E(service).getChild()).doWork();

// Pass object references in arguments
await E(service).processObject(myLocalObject);
```

### Error Handling

```javascript
{
  async callService() {
    try {
      const result = await E(service).riskyMethod();
      return result;
    } catch (error) {
      logger.error('Service call failed:', error);
      throw new Error(`Failed to call service: ${error.message}`);
    }
  }
}
```

## Type Safety (Advanced)

For type-safe Caplets, use `@endo/patterns` and `@endo/exo`:

```javascript
import { M } from '@endo/patterns';
import { defineExoClass } from '@endo/exo';

const ServiceI = M.interface('ServiceInterface', {
  echo: M.call(M.string()).returns(M.string()),
});

const Service = defineExoClass(
  'Service',
  ServiceI,
  () => ({}),
  {
    echo(message) {
      return `Echo: ${message}`;
    },
  },
);

export function buildRootObject(vatPowers, parameters, baggage) {
  return Service.make();
}
```

## Security Considerations

1. **Always harden objects**: Use `makeDefaultExo` or `harden()` to prevent mutation
2. **Validate inputs**: Check arguments before processing
3. **Capability discipline**: Only pass necessary capabilities, follow POLA (Principle of Least Authority)
4. **Don't leak references**: Be careful about returning internal objects
5. **Handle errors gracefully**: Don't expose internal state in error messages

## Example Caplets

See reference implementations:
- `packages/omnium-gatherum/src/vats/echo-caplet.ts` - Simple service provider
- `packages/omnium-gatherum/src/vats/consumer-caplet.ts` - Service consumer (Phase 2)

Also see kernel test vats for patterns:
- `packages/kernel-test/src/vats/exo-vat.js` - Advanced exo patterns
- `packages/kernel-test/src/vats/service-vat.js` - Service injection example
- `packages/kernel-test/src/vats/logger-vat.js` - Minimal vat example

## Bundle Creation

Caplet source files must be bundled using `@endo/bundle-source`:

```bash
# Using the ocap CLI
yarn ocap bundle src/vats/my-caplet.ts

# Creates: src/vats/my-caplet.bundle
```

The generated `.bundle` file is referenced in the Caplet manifest's `bundleSpec` field.

## Manifest Integration

Each Caplet must have a manifest that references its bundle:

```typescript
const myCapletManifest: CapletManifest = {
  id: 'com.example.my-caplet',
  name: 'My Caplet',
  version: '1.0.0',
  bundleSpec: 'file:///path/to/my-caplet.bundle',
  requestedServices: ['someService'],
  providedServices: ['myService'],
};
```

## Summary

A valid Caplet vat must:

1. ✅ Export `buildRootObject(vatPowers, parameters, baggage)`
2. ✅ Return a hardened root object (use `makeDefaultExo`)
3. ✅ Optionally implement `bootstrap()` for initialization
4. ✅ Access services from `parameters` object (Phase 1)
5. ✅ Use `E()` for async service calls
6. ✅ Use `vatPowers.logger` for logging
7. ✅ Follow object capability security principles

This contract ensures Caplets can interoperate within the Omnium ecosystem while maintaining security and composability.
