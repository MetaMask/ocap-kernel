# Omnium plan

## TODO

### Immediate Next Steps

To complete Phase 1 and achieve a working PoC:

1. **Define Caplet Vat Contract** (Section 1.2)

   - Document `buildRootObject()` signature and expected interface
   - Decide on service initialization approach (bootstrap params vs explicit initialize method)
   - Create `docs/caplet-contract.md`

2. **Create Example Caplet Vats** (Section 1.6, 1.7)

   - `test/fixtures/echo-caplet/`: Simple service provider
   - `test/fixtures/consumer-caplet/`: Service consumer
   - Use for both dev console examples and integration tests

3. **Bundle Loading** (Section 1.3)

   - Implement bundle-loader utility for inline/URL/file sources
   - Integrate into CapletController.install()

4. **Integration & E2E Testing** (Section 1.7)

   - Write `test/caplet-integration.test.ts` with real vat bundles
   - Validate full install → communicate → uninstall lifecycle
   - Test error cases and edge conditions
   - Write `test/e2e/caplet.spec.ts` with real vat bundles, testing the full flow

5. **Documentation** (Section 1.8)
   - Architecture doc with CapTP and controller patterns
   - Caplet development guide
   - Dev console usage examples

### Phase 1: Caplet Installation and Service Discovery

This phase focuses on establishing the foundational architecture for Caplets:
defining their structure, implementing installation mechanics, and creating a
service discovery mechanism that allows Caplets to communicate using object
capabilities. This phase will be complete when we have a working PoC that:

1. Install two caplets, a service producer and a service consumer
2. The service producer can be discovered by the service consumer
   - Hard-coding "discovery" is acceptable for Phase 1.
3. The service consumer calls methods on the service producer
   - e.g. `E(serviceProducer).echo(message) => 'Hello, world!'`
4. The caplets can be uninstalled, and the process repeated

**Current Status (as of 2026-01-09)**:

- ✅ **Sections 1.0-1.2 Complete**: Dev console, CapTP infrastructure, controller architecture fully implemented and tested
- 🚧 **Section 1.3 Partially Complete**: Basic caplet install/uninstall works; bundle loading and service resolution deferred
- ⏸️ **Section 1.4 Deferred**: Service registry vat deferred to Phase 2 (using direct reference passing in Phase 1)
- 🚧 **Section 1.6 Mostly Complete**: Dev console API implemented; examples and docs needed
- 🚧 **Section 1.7 Partially Complete**: Comprehensive unit tests; integration tests with actual caplet vats needed
- 📝 **Section 1.8 TODO**: Architecture and developer documentation needed

#### 1.0 Omnium dev console

- [x] Extension background dev console implementation

  - Add `globalThis.omnium` in `background.ts`
  - Model this on `globalThis.kernel` in @packages/extension
  - This "dev console" object is how we expose remote objects and
    other functionality in the dev console

#### 1.1 Build Userspace E() Infrastructure

**Goal**: Enable userspace (background script) to use `E()` naturally with kernel and vat objects, establishing the foundation for omnium ↔ kernel ↔ vat communication.

**Architecture**: Use **CapTP** (`@endo/captp`) to create proper remote presences that work with `E()`. CapTP is the standard Endo capability transfer protocol that handles remote object references, promise resolution, and garbage collection automatically.

- [x] **CapTP-based Remote Presence Implementation**

  - Using `@endo/captp` for proper remote presence handling
  - Kernel-side CapTP setup:
    - Location: `packages/kernel-browser-runtime/src/kernel-worker/captp/`
    - `kernel-facade.ts` - Creates a kernel facade exo using `makeDefaultExo`
    - `kernel-captp.ts` - Sets up CapTP endpoint with kernel facade as bootstrap
  - Background-side CapTP setup:
    - Location: `packages/kernel-browser-runtime/src/background-captp.ts`
    - Shared by both omnium-gatherum and extension packages
    - Exports: `makeBackgroundCapTP`, `isCapTPNotification`, `getCapTPMessage`, `makeCapTPNotification`
    - TypeScript types: `KernelFacade`, `CapTPMessage`, `BackgroundCapTP`
  - CapTP messages are wrapped in JSON-RPC notifications: `{ method: 'captp', params: [captpMsg] }`
  - `E` is globally available (set in trusted prelude before lockdown)
  - `getKernel()` exposed on `globalThis.omnium` (omnium) or `globalThis.kernel` (extension)
  - Kernel's internal commandStream and RPC removed - CapTP is now the only communication path
  - Usage example:

    ```typescript
    const kernel = await omnium.getKernel();
    const status = await E(kernel).getStatus();
    ```

- [x] **Kernel Facade**

  - Kernel facade exposes kernel methods via CapTP:
    - `launchSubcluster(config)` - Launch a subcluster of vats
    - `terminateSubcluster(subclusterId)` - Terminate a subcluster
    - `queueMessage(target, method, args)` - Send a message to a kref
    - `getStatus()` - Get kernel status
    - `pingVat(vatId)` - Ping a vat

- [x] **Message Routing**

  - Messages flow: background → offscreen → kernel-worker
  - All streams use `JsonRpcMessage` type for bidirectional messaging
  - Kernel-worker receives CapTP notifications and dispatches to kernel's CapTP endpoint
  - No message router needed - all background ↔ kernel communication uses CapTP exclusively

- [ ] **Argument Serialization** (Partial - Phase 2)

  - Phase 1: JSON-serializable arguments only
  - Phase 2: Handle serialization of arguments that may contain object references
    - Pass-by-reference: Other krefs in arguments should be preserved
    - Pass-by-copy: Plain data (JSON-serializable) should be copied
    - CapTP handles this automatically with proper configuration

- [x] **Promise Management**

  - CapTP handles promise resolution automatically via CTP_RESOLVE messages
  - Phase 1: Basic promise resolution
  - Phase 2+: Promise pipelining supported by CapTP

- [x] **Testing**
  - Tests to be added for CapTP-based approach

**Note**: Using CapTP provides several advantages over a custom implementation:

1. Proper integration with `E()` from `@endo/eventual-send` via `resolveWithPresence()`
2. Automatic promise pipelining support
3. Garbage collection of remote references
4. Battle-tested implementation from the Endo ecosystem

#### 1.2 Define Caplet Structure

**Goal**: Establish the data structures, storage abstractions, and controller architecture for Caplets.

- [x] **Controller Architecture**

  - Established modular controller pattern in `packages/omnium-gatherum/src/controllers/`:
    - **Abstract `Controller` base class** (`base-controller.ts`):
      - Generic base class parameterized by controller name, state shape, and methods
      - Provides protected `state`, `update()`, and `logger` accessors
      - Subclasses must implement `makeFacet()` to return hardened exo
      - Enforces hardening pattern (`harden(this)` in constructor)
    - Controllers manage state and business logic
    - Controllers communicate via `E()` for capability attenuation (POLA)
    - Each controller receives namespaced storage (isolated key space)
  - `controllers/types.ts`: Base controller types (`ControllerConfig`, `ControllerMethods`)
  - `controllers/facet.ts`: `makeFacet()` utility for POLA attenuation between controllers

- [x] **Storage Abstraction Layer**

  - `controllers/storage/types.ts`: Storage interfaces
    - `StorageAdapter`: Low-level wrapper for platform storage APIs
  - `controllers/storage/chrome-storage.ts`: `makeChromeStorageAdapter()` for Chrome Storage API
  - `controllers/storage/controller-storage.ts`: **`ControllerStorage` class** for controller state management
    - **Refactored to class-based design** with static `make()` factory method
    - Controllers work with a typed `state` object instead of managing storage keys directly
    - Uses Immer for immutable updates with change tracking
    - **Synchronous `update()` with debounced fire-and-forget persistence**:
      - Updates are synchronous in memory for immediate consistency
      - Persistence is debounced (default 100ms) with accumulated key tracking
      - Implements bounded latency (timer not reset across updates)
      - Immediate writes when idle > debounceMs for better responsiveness
    - Only persists modified top-level keys (via Immer patches)
    - Storage keys automatically prefixed: `${namespace}.${key}` (e.g., `caplet.caplets`)
    - `clear()` and `clearState()` methods to reset to defaults

- [x] **Caplet Manifest Schema**

  - Defined TypeScript types with superstruct validation in `controllers/caplet/types.ts`:
    - `CapletId`: Reverse domain notation (e.g., `"com.example.bitcoin-signer"`)
    - `SemVer`: Semantic version string (strict format, no `v` prefix)
    - `CapletManifest`: Full manifest with id, name, version, bundleSpec, requestedServices, providedServices
    - `InstalledCaplet`: Runtime record with manifest, subclusterId, installedAt timestamp
  - Validation functions: `isCapletId()`, `isSemVer()`, `isCapletManifest()`, `assertCapletManifest()`

- [x] **CapletController**

  - `controllers/caplet/caplet-controller.ts`: **`CapletController` class extends `Controller` base**
  - **Refactored to use Controller base class**:
    - Static `make()` factory creates storage internally
    - Private constructor ensures proper initialization flow
    - `makeFacet()` returns hardened exo with public methods
    - Uses protected `state`, `update()`, and `logger` from base class
  - Methods exposed via `CapletControllerFacet`:
    - `install(manifest, bundle?)`: Validate manifest, launch subcluster, store metadata
    - `uninstall(capletId)`: Terminate subcluster, remove metadata
    - `list()`: Get all installed caplets
    - `get(capletId)`: Get specific caplet
    - `getByService(serviceName)`: Find caplet providing a service
  - State structure (`CapletControllerState`):
    - `caplets`: `Record<CapletId, InstalledCaplet>` - all caplet data in a single record
  - Dependencies injected via `CapletControllerDeps` (attenuated for POLA):
    - `adapter`: Storage adapter
    - `launchSubcluster`: Function to launch subclusters
    - `terminateSubcluster`: Function to terminate subclusters
  - State management via `ControllerStorage<CapletControllerState>`:
    - Synchronous reads via `this.state.caplets[id]`
    - Synchronous updates via `this.update(draft => { ... })`

- [x] **Dev Console Integration**

  - Wired CapletController into `background.ts`
  - Exposed on `globalThis.omnium.caplet`:
    - `install(manifest, bundle?)`, `uninstall(capletId)`, `list()`, `get(capletId)`, `getByService(serviceName)`

**Recent Refactorings (commits cd5adbd, 9b8c4c9, e400c93)**:

1. **Controller Base Class** (9b8c4c9):

   - Extracted common patterns into abstract `Controller<Name, State, Methods>` base class
   - Enforces consistent initialization flow (static `make()`, private constructor, `makeFacet()`)
   - Provides protected accessors for `state`, `update()`, `logger`
   - CapletController now extends Controller instead of standalone implementation

2. **ControllerStorage Refactoring** (cd5adbd):

   - Converted from factory function to class-based design with static `make()`
   - Implemented synchronous `update()` for immediate in-memory consistency
   - Added debounced fire-and-forget persistence with:
     - Accumulated key tracking across debounce window (critical bug fix)
     - Bounded latency (timer not reset on subsequent updates)
     - Immediate writes after idle period for better responsiveness
   - Added `clear()` and `clearState()` methods
   - Removed old `namespaced-storage` implementation (no longer needed)

3. **State Structure Simplification** (e400c93):
   - Consolidated CapletController state into single `caplets: Record<CapletId, InstalledCaplet>`
   - Eliminated separate per-caplet storage keys in favor of single consolidated state object
   - Simplified queries (list, get, getByService) to work directly on in-memory state

**Architecture Evolution Notes**:

- Storage layer now provides strong consistency guarantees (synchronous updates)
- Controllers can safely call `this.state` immediately after `this.update()`
- Persistence failures are logged but don't block operations (fire-and-forget)
- Future controllers can extend the base class with minimal boilerplate

- [ ] **Caplet Vat Bundle Format** (Deferred - High Priority)

  - A Caplet's code is a standard vat bundle (JSON output from `@endo/bundle-source`)
  - The vat must export `buildRootObject(vatPowers, parameters, baggage)` as per kernel conventions
  - The root object should implement a standard Caplet interface (TBD):
    - Option A: `initialize(services)` receives requested services, returns own service interface(s)
    - Option B: Root object IS the service interface, services injected via bootstrap parameters
    - `shutdown()` cleanup hook (if needed)
  - **Blocker for integration testing**: Need to define and document this contract before writing actual caplet vats
  - Document the Caplet vat contract in `packages/omnium-gatherum/docs/caplet-contract.md`
  - Create minimal example caplet in `test/fixtures/echo-caplet/` to validate the contract

#### 1.3 Implement Caplet Installation

**Goal**: Enable loading a Caplet into omnium, creating its subcluster, and registering it.

- [x] **Basic Caplet Installation (Implemented in CapletController)**

  - **Current implementation in `CapletController.install()`**:
    - ✓ Validates Caplet manifest using `isCapletManifest()`
    - ✓ Checks for duplicate installations
    - ✓ Creates `ClusterConfig` with single vat named after Caplet ID
    - ✓ Calls `E(kernel).launchSubcluster(config)` via injected dependency
    - ✓ Determines subclusterId by diffing kernel status before/after launch
    - ✓ Stores Caplet metadata (manifest, subclusterId, installedAt) in storage
    - ✓ Returns `InstallResult` with capletId and subclusterId
  - **Current limitations**:
    - Bundle parameter currently unused (uses `bundleSpec` from manifest directly)
    - No service resolution yet (Phase 1 deferred - see 1.4)
    - No kref capture from launch result
    - Basic error handling (throws on validation/launch failures)

- [ ] **Bundle Loading Utilities** (TODO)

  - Currently: `bundleSpec` passed through directly to kernel's ClusterConfig
  - Need to support multiple bundle sources over time:
    - Inline bundle (passed as JSON)
    - Local file path (for development)
    - HTTP(S) URL (fetch bundle remotely)
  - Use existing `@endo/bundle-source` for creating bundles
  - Proposed location: `packages/omnium-gatherum/src/controllers/caplet/bundle-loader.ts`

- [~] **Installation Lifecycle** (Partially implemented)
  - ✓ 1. Validate manifest
  - [ ] 2. Load bundle (currently bypassed - uses bundleSpec directly)
  - [ ] 3. Resolve requested services (Phase 1 deferred)
  - ✓ 4. Create subcluster via `launchSubcluster()`
  - [ ] 5. Capture Caplet's root kref from launch result (TODO)
  - ✓ 6. Store Caplet metadata in storage
  - [ ] 7. Pass resolved service krefs in bootstrap (Phase 1 deferred)
  - [~] 8. Handle installation errors (basic error handling, no rollback)

**Phase 1 Status**: Basic installation flow works for simple caplets. Service resolution and advanced bundle loading deferred until PoC validation with actual caplet vats.

#### 1.4 Create Omnium Service Registry (DEFERRED to Phase 2)

**Goal**: Provide dynamic service discovery where Caplets can register services and request capabilities at runtime.

**Architecture Decision**: The service registry will be a **"well-known" vat** that omnium populates with service data from Chrome storage (the canonical source of truth).

**Status**: **Deferred to Phase 2**. Phase 1 uses direct reference passing for PoC.

**Future Architecture (Phase 2+)**:

- [ ] **TODO: Design revocable service connections**

  - Service connections need to be revocable (not just direct object references)
  - Consider: membrane pattern, revocable proxies, explicit grant/revoke lifecycle
  - Who can revoke? Omnium? Service provider? User?
  - What happens to in-flight messages when revoked?
  - How do we represent revocation in the UI?

- [ ] **Service Registry Vat** (Phase 2)

  - Create `packages/omnium-gatherum/src/vats/registry-vat.js`
  - Implement a vat that exports `buildRootObject()` returning a registry exo
  - Methods:
    - `registerService(capletId, serviceName, serviceObject)`: Associates service with Caplet
    - `getService(serviceName)`: Returns service object (or revocable proxy)
    - `listServices()`: Returns available services
    - `unregisterCapletServices(capletId)`: Cleanup on uninstall
    - `revokeService(capletId, serviceName)`: Revoke a specific service grant
  - **Note**: Registry vat's baggage may be minimal or empty - it's primarily a mediator
  - Omnium populates it with data from Chrome storage using E()

- [ ] **Omnium Populates Registry** (Phase 2)

  - After installing a Caplet:
    1. Omnium launches the Caplet, captures its root kref
    2. Omnium calls `E(registry).registerService(capletId, serviceName, capletKref)`
    3. Registry vat now knows about this service
  - When a Caplet requests a service:
    1. Caplet calls `E(registry).getService(serviceName)`
    2. Registry returns the provider's kref (or revocable proxy)
  - Canonical state: Chrome storage
  - Registry vat: Derived state, populated by omnium

- [ ] **Caplet Service Registration Flow** (Phase 2)
  - All Caplets receive registry vat reference in bootstrap
  - Dynamic discovery: Caplets can request services at runtime
  - Revocation: Connections can be terminated, must handle gracefully

**Phase 1 Approach**: Skip registry vat entirely. Services resolved at install time and passed directly to Caplets via bootstrap arguments. This gets us to a working PoC faster while we design the revocation model.

#### 1.5 Caplet Communication Protocol

**Goal**: Define how Caplets use capabilities from other Caplets.

**Status**: Deferred until we have actual caplet vats to test with.

- [ ] **Phase 1: Direct Reference Pattern** (Design complete, implementation deferred)

  - Document the flow in `packages/omnium-gatherum/docs/service-discovery.md`:
    1. Caplet A's manifest declares `requestedServices: ["bitcoin"]`
    2. Omnium looks up bitcoin service provider (Caplet B) in Chrome storage
    3. Omnium retrieves Caplet B's root kref
    4. Omnium passes Caplet B's kref to Caplet A in bootstrap: `bootstrap(vats, { bitcoin: capletBKref })`
    5. Caplet A uses `E(bitcoin).someMethod()` to invoke methods
    6. Messages are routed through kernel (standard vat-to-vat messaging)
  - **Limitation**: Services resolved at install time, no runtime discovery
  - **Benefit**: Simple, no registry vat needed for PoC

- [ ] **Phase 2+: Dynamic Discovery Pattern** (Deferred)

  - Caplets receive registry vat reference
  - Can request services at runtime: `E(registry).getService("someService")`
  - Services can be revoked
  - More flexible but requires registry vat infrastructure

- [ ] **Service Interface Conventions**
  - Define recommended patterns for service interfaces:
    - Use async methods (return promises)
    - Accept/return serializable data or object references
    - Document expected methods in service interface types
  - Create example service interfaces in `packages/omnium-gatherum/src/services/interfaces.ts`

#### 1.6 Dev Console Integration

**Goal**: Make Caplet installation usable from the Chrome DevTools console.

- [x] **Expose Caplet Operations on globalThis.omnium**

  - **Implemented in `packages/omnium-gatherum/src/background.ts`**:
    - ✓ `globalThis.omnium` object defined and hardened
    - ✓ `globalThis.E` exposed for manual E() calls
    - ✓ `omnium.ping()`: Test kernel connectivity
    - ✓ `omnium.getKernel()`: Get kernel remote presence for E() calls
    - ✓ `omnium.caplet.install(manifest, bundle?)`: Install a Caplet
      - Delegates to `E(capletController).install(manifest, bundle)`
      - Returns: `Promise<InstallResult>` with `{ capletId, subclusterId }`
    - ✓ `omnium.caplet.uninstall(capletId)`: Uninstall a Caplet
      - Terminates its subcluster and removes from storage
    - ✓ `omnium.caplet.list()`: List installed Caplets
      - Returns: `Promise<InstalledCaplet[]>`
    - ✓ `omnium.caplet.get(capletId)`: Get specific caplet
      - Returns: `Promise<InstalledCaplet | undefined>`
    - ✓ `omnium.caplet.getByService(serviceName)`: Find caplet providing a service
      - Returns: `Promise<InstalledCaplet | undefined>`
    - ✓ All `omnium.caplet` methods are hardened
  - **Not yet implemented**:
    - `omnium.service` namespace (deferred - Phase 2 registry vat)

- [ ] **Example Usage in Console** (TODO)

  - Create test Caplets in `packages/omnium-gatherum/test/fixtures/`:
    - `echo-caplet`: Simple Caplet that registers an "echo" service
    - `consumer-caplet`: Caplet that discovers and calls the "echo" service
  - Document console commands in `packages/omnium-gatherum/docs/dev-console-usage.md`:

    ```javascript
    // Install echo Caplet
    await omnium.caplet.install({
      id: 'com.example.echo',
      name: 'Echo Service',
      version: '1.0.0',
      bundleSpec: '/path/to/echo.bundle',
      providedServices: ['echo'],
      requestedServices: [],
    });

    // List installed Caplets
    await omnium.caplet.list();

    // Get specific caplet
    await omnium.caplet.get('com.example.echo');

    // Find caplet by service
    await omnium.caplet.getByService('echo');

    // Uninstall
    await omnium.caplet.uninstall('com.example.echo');
    ```

**Status**: Core dev console integration complete. Documentation and example fixtures needed.

#### 1.7 Testing

**Goal**: Validate that Caplets can be installed and communicate with each other.

- [x] **Unit Tests** (Implemented)

  - ✓ `controllers/caplet/types.test.ts`: Validates manifest schema, CapletId, SemVer formats
  - ✓ `controllers/caplet/caplet-controller.test.ts`: Tests CapletController methods (install, uninstall, list, get, getByService)
  - ✓ `controllers/base-controller.test.ts`: Tests abstract Controller base class (12 tests)
  - ✓ `controllers/storage/controller-storage.test.ts`: Tests ControllerStorage with debouncing, accumulation, bounded latency
  - ✓ `controllers/storage/chrome-storage.test.ts`: Tests ChromeStorageAdapter
  - ✓ `controllers/facet.test.ts`: Tests makeFacet utility
  - ✓ `kernel-browser-runtime`: CapTP infrastructure tests (background-captp, kernel-facade, kernel-captp, integration)

- [ ] **Integration Tests** (TODO)

  - Need: End-to-end caplet tests with actual vat bundles
  - `packages/omnium-gatherum/test/caplet-integration.test.ts`:
    - Install two Caplets with real vat code
    - Verify one can discover and call the other's service
    - Verify message passing works correctly through kernel
    - Test uninstallation and cleanup
    - Test error handling (invalid manifests, launch failures, etc.)

- [~] **E2E Tests (Playwright)** (Smoke test only)
  - ✓ `test/e2e/smoke.test.ts`: Basic extension loading
  - [ ] `test/e2e/caplet.spec.ts`: Full caplet workflow
    - Load omnium extension in browser
    - Use console to install Caplets
    - Verify they can communicate
    - Check DevTools console output
    - Test UI interactions (if applicable)

#### 1.8 Documentation

- [ ] **Architecture Documentation** (TODO)

  - Create `packages/omnium-gatherum/docs/architecture.md`:
    - Explain how Caplets relate to subclusters and vats
    - Diagram showing omnium → kernel → Caplet subclusters
    - Userspace E() infrastructure (CapTP-based)
    - Controller architecture and storage layer
    - Phase 1: Direct reference passing vs Phase 2: Dynamic service discovery

- [ ] **Developer Guide** (TODO)

  - Create `packages/omnium-gatherum/docs/caplet-development.md`:
    - How to write a Caplet vat
    - Caplet vat contract (buildRootObject, initialization, etc.)
    - Service registration examples
    - Requesting services from other Caplets
    - Testing Caplets locally
    - Bundle creation with @endo/bundle-source

- [ ] **Dev Console Usage Guide** (TODO)
  - Create `packages/omnium-gatherum/docs/dev-console-usage.md`:
    - Using `globalThis.omnium` in Chrome DevTools
    - Installing/uninstalling caplets
    - Querying installed caplets and services
    - Example console workflows

---

### Future Phases: UI Architecture

**Context**: Phase 1 focuses on headless Caplets with dev console interaction only. This section outlines the vision for how Caplets will eventually provide user-facing UI while maintaining security and composability.

#### Core Principles

1. **Zero trust for Caplet UI code**: Caplet-provided UI code must not run in privileged extension contexts
2. **Composability**: Multiple Caplets' UIs should compose naturally into a cohesive experience
3. **Security isolation**: Caplet UI should be isolated from other Caplets and omnium's privileged code
4. **User experience**: UI should feel cohesive, not fragmented

#### Phase 2: Declarative UI Contributions

**Goal**: Enable Caplets to describe their data and capabilities using a safe, declarative format that Omnium renders using trusted UI components.

- **Caplet UI Manifest**:

  - Caplets declare what they provide via structured metadata (not code):
    - Account types: `{ type: "bitcoin", properties: ["address", "balance", "publicKey"] }`
    - Actions: `{ name: "signTransaction", inputs: [...], confirmation: "Show tx details" }`
    - Settings: `{ name: "Network", type: "select", options: [...] }`
  - Similar to how native apps declare permissions and intents

- **Omnium UI Framework**:

  - Provides trusted, pre-built UI components:
    - Account list view (renders all accounts from all Caplets)
    - Transaction confirmation modal
    - Settings panels
    - Status indicators
  - Caplets' data flows into these components
  - Omnium controls all rendering (no Caplet code execution in UI context)

- **Data Flow**:

  ```
  Caplet vat → Service methods → RPC → Background → Omnium UI components → Rendered UI
  ```

- **Benefits**:

  - Caplets customize UX without providing arbitrary code
  - Omnium maintains UX consistency
  - Security: Only trusted omnium code renders UI
  - Composability: Multiple Caplets' data can be combined in standard views

- **Limitations**:
  - Caplets cannot provide fully custom UX
  - Limited to omnium's predefined UI patterns
  - Novel UI patterns require omnium updates

#### Phase 3: Isolated UI Frames (Advanced)

**Goal**: Allow Caplets to provide custom UI for complex use cases while maintaining security isolation.

- **Architecture**:

  - Caplets can optionally provide UI content served in isolated iframes
  - Each Caplet's UI runs in a separate iframe with strict CSP
  - Communication between Caplet UI and Caplet vat via postMessage/RPC
  - Caplet UI cannot access other Caplets or omnium privileged APIs

- **UI Composition Challenges**:

  - Multiple iframes are harder to compose into cohesive UX
  - Cross-frame communication complexity
  - Performance and visual consistency concerns

- **Possible Solutions**:

  - Web Components: Caplets define custom elements that omnium can compose
  - Shadow DOM for style isolation
  - Standardized theming/design tokens for visual consistency
  - Message bus for inter-Caplet UI communication (mediated by omnium)

- **Research Questions**:
  - Can we achieve seamless composition with iframe-based isolation?
  - Are Web Components + Shadow DOM sufficient for security isolation?
  - How do we handle shared state (e.g., global loading indicators, modals)?
  - Can we use technologies like import maps with module federation for safer code loading?

#### Phase 4: Trusted UI Plugins (Speculative)

**Goal**: Separate the trust model for UI from backend Caplet logic.

- **Two-tier system**:

  - **Caplets**: Headless services (untrusted, fully sandboxed)
  - **UI Plugins**: Separate entities that call Caplet services (potentially more trusted)

- **UI Plugin Trust Model**:

  - UI plugins go through different review/curation
  - May have different permission model
  - Could run in less-sandboxed contexts if they meet trust requirements
  - Users explicitly install UI plugins separately from backend Caplets

- **Benefits**:

  - Flexibility: Same backend Caplet can have multiple UIs
  - Security: Can have stricter requirements for UI plugins
  - Separation: Backend and frontend evolve independently

- **Challenges**:
  - More complex installation/discovery
  - Coordination between Caplet and UI plugin developers
  - User confusion about two types of plugins

#### Open Research Questions

1. **Secure UI composition**: Is it possible to achieve truly composable UI while maintaining strong security isolation?
2. **Web platform primitives**: Can we leverage Web Components, Shadow DOM, import maps, etc. effectively?
3. **User experience**: How do we maintain UX cohesion with third-party UI contributions?
4. **Performance**: What's the overhead of iframe/web component isolation?
5. **Developer experience**: How do we make it easy to build Caplet UIs within constraints?

#### Recommendation for Phase 1

For Phase 1, **defer all UI architecture decisions**:

- Caplets are purely headless services
- Dev console provides all interaction
- This gives us time to research and experiment with UI approaches
- Backend architecture (service discovery, vat communication) is orthogonal to UI

---

### Open Questions / Design Decisions for Phase 1

1. **One vat vs. multiple vats per Caplet?**

   - Start with one vat per Caplet (simplest)
   - A Caplet can launch multiple vats if needed by creating its own sub-subcluster

2. **Capability approval mechanism?**

   - Phase 1: No approval UI, services are freely accessible once registered
   - Phase 2: Add approval prompts before granting service access

3. **Service naming conflicts?**

   - Phase 1: Last-registered wins
   - Phase 2: Support namespacing or multiple providers

4. **Where does omnium's own code run?**

   - Background script: Installation management, E() calls to kernel, Chrome storage for metadata (canonical)
   - Phase 1: No registry vat (services passed directly)
   - Phase 2+: Registry vat for dynamic discovery (omnium-populated, revocable connections)
   - Caplets: Each in their own subcluster
   - Clean separation: kernel knows nothing about Caplets, only vats/subclusters

5. **Bundle storage?**

   - Phase 1: Bundles are ephemeral, not stored (must re-provide on install)
   - Phase 2: Store bundles in Chrome storage or IndexedDB for persistence across restarts
   - Never in kernel store - maintains user/kernel space separation

6. **How do Caplets receive service references?**

   - Phase 1: Via bootstrap arguments - resolved krefs passed directly (e.g., `bootstrap(vats, { bitcoin: kref })`)
   - Phase 2+: Via registry vat - dynamic discovery at runtime

7. **Userspace E() infrastructure**
   - Critical foundation: Enables omnium to use E() to interact with kernel and vat objects
   - Kernel exposes exo interface
   - Userspace creates remote proxies to vat objects using returned krefs
   - This is how omnium will populate the registry vat in Phase 2

## High-level plan

### Components Built Into Omnium Directly

These are the core distribution components that ship with omnium-gatherum:

1. Extension Shell

- Background service worker orchestration
- Offscreen document for kernel isolation
- Popup interface
- DevTools integration
- Communication with third-party context via `externally_connectable`

2. Kernel Integration Layer

- Kernel worker initialization and lifecycle management
- RPC client/server plumbing between extension contexts
- Stream-based IPC infrastructure
- Storage initialization and migration

3. Caplet Management UI

- Install/uninstall Caplets interface
- View all installed Caplets with versions
- Update management (review diffs, approve updates, pin versions)
- Search/browse Caplets from configured registries
- Direct installation by CID (for uncensored access)

4. Capability Management System

- Capability grant approval UI (shown on install and at runtime)
- Revocation controls for active capabilities
- Attenuation interface (time limits, rate limits, scoping)
- Capability audit log/visualization
- Inter-Caplet capability delegation review

5. Security & Trust UI

- Risk labels and warnings
- Attestation display (audits, security reviews, community ratings)
- Requested capabilities review on install
- Code diff viewer for updates
- Emergency quarantine controls (opt-in to DAO flags)
- Reproducible build verification status

6. Wallet Configuration Management

- Blueprint export/import (save/restore entire wallet setup)
- Registry management (add/remove registries)
- Settings and preferences
- Backup/recovery workflows (delegates to installed signer Caplets)

7. Bootstrap Experience

- First-run setup flow
- Default registry configuration
- Possibly a minimal set of "blessed" initial Caplets (or truly zero - TBD)
- Onboarding education about the Caplet model

### Caplet Ecosystem Support (External Components)

These enable the permissionless, decentralized Caplet ecosystem:

1. Publishing Infrastructure

- IPFS pinning services, deterministic builds, code signing tools, registry
  registration protocol

2. Registry System

- Onchain registry contracts, multiple independent registries, curation
  mechanisms (staking, slashing), search/discovery APIs

3. Governance & Economics

- TBD

4. Security & Attestation

- Auditor network, bug bounty platform, attestation publication (EAS/DIDs),
  continuous monitoring

5. Developer Tooling

- Caplet SDK (TypeScript), testing harness for sandbox behavior, build/publish
  CLI, reference implementations and templates, capability protocol documentation

The key distinction: omnium is the user-facing distribution that makes the
kernel usable, while the ecosystem components enable the permissionless
marketplace of Caplets that omnium consumers can install.
