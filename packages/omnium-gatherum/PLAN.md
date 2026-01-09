# Omnium plan

## TODO

### Phase 1: Caplet Installation and Service Discovery

This phase focuses on establishing the foundational architecture for Caplets:
defining their structure, implementing installation mechanics, and creating a
service discovery mechanism that allows Caplets to communicate using object
capabilities.

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

- [ ] **Testing**
  - Tests to be added for CapTP-based approach

**Note**: Using CapTP provides several advantages over a custom implementation:

1. Proper integration with `E()` from `@endo/eventual-send` via `resolveWithPresence()`
2. Automatic promise pipelining support
3. Garbage collection of remote references
4. Battle-tested implementation from the Endo ecosystem

#### 1.2 Define Caplet Structure

**Goal**: Establish the data structures and formats that define a Caplet.

- [ ] **Caplet Manifest Schema**

  - Define a TypeScript type/superstruct for Caplet metadata:
    - `id`: Unique identifier (string, e.g., `"com.example.bitcoin-signer"`)
    - `name`: Human-readable name
    - `version`: Semantic version
    - `bundleSpec`: URI to the vat bundle (for now, local file paths or inline bundles)
    - `requestedServices`: Array of service names this Caplet wants to consume (e.g., `["keyring", "network"]`)
    - `providedServices`: Array of service names this Caplet exposes (e.g., `["bitcoin-signer"]`)
    - `description`: Optional description
    - `author`: Optional author info
  - Location: Create `packages/omnium-gatherum/src/caplet/types.ts`

- [ ] **Caplet Vat Bundle Format**

  - A Caplet's code is a standard vat bundle (JSON output from `@endo/bundle-source`)
  - The vat must export `buildRootObject(vatPowers, parameters, baggage)` as per kernel conventions
  - The root object should implement a standard Caplet interface:
    - `initialize(services)`: Receives requested services, returns own service interface(s)
    - `shutdown()`: Cleanup hook
  - Document the Caplet vat contract in `packages/omnium-gatherum/docs/caplet-contract.md`

- [ ] **Caplet Storage Schema**
  - Define how installed Caplets are persisted in **user space** (not kernel store):
    - Use **Chrome Storage API** (`chrome.storage.local`) for omnium-specific data
    - Maintains clean kernel/user space separation - kernel doesn't know about Caplets
    - Storage keys:
      - `caplet.${capletId}.manifest` → JSON manifest
      - `caplet.${capletId}.subclusterId` → Associated subcluster ID
      - `caplet.installed` → Array of installed Caplet IDs
  - Location: `packages/omnium-gatherum/src/caplet/storage.ts`
  - Note: This is omnium's own storage, separate from kernel store

#### 1.3 Implement Caplet Installation

**Goal**: Enable loading a Caplet into omnium, creating its subcluster, and registering it.

- [ ] **Caplet Installation Service (Non-Vat Code)**

  - Create `packages/omnium-gatherum/src/caplet/installer.ts`
  - Implement `CapletInstaller` class that:
    - Validates Caplet manifest
    - Loads vat bundle (from URL or inline)
    - Resolves requested services from Chrome storage (canonical source of truth)
    - Creates a ClusterConfig for the Caplet:
      - Single vat named after the Caplet ID
      - Bootstrap vat is the Caplet itself
      - **Phase 1**: Pass resolved service krefs directly via bootstrap arguments
    - Calls `E(kernel).launchSubcluster(config)` (using userspace E() infrastructure)
    - Captures returned Caplet root kref
    - Stores Caplet manifest, subcluster ID, and root kref in Chrome storage
    - Returns installation result (success/failure + subcluster ID + kref)

- [ ] **Bundle Loading Utilities**

  - Support multiple bundle sources:
    - Inline bundle (passed as JSON)
    - Local file path (for development)
    - HTTP(S) URL (fetch bundle remotely)
  - Use existing `@endo/bundle-source` for creating bundles
  - Location: `packages/omnium-gatherum/src/caplet/bundle-loader.ts`

- [ ] **Installation Lifecycle**
  - On install:
    1. Validate manifest
    2. Load bundle
    3. Resolve requested services (lookup krefs from Chrome storage)
    4. Create subcluster, passing resolved service krefs in bootstrap
    5. Capture Caplet's root kref from launch result
    6. Store Caplet metadata (manifest, subcluster ID, root kref) in Chrome storage
    7. **Phase 1**: Direct reference passing - Caplet receives services immediately
  - Handle installation errors (rollback if possible)

**Phase 1 Approach**: Services are resolved at install time and passed directly to Caplets. No dynamic service discovery in Phase 1 - this enables us to reach PoC faster without building the full registry vat architecture.

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

- [ ] **Phase 1: Direct Reference Pattern**

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

- [ ] **Expose Caplet Operations on globalThis.omnium**

  - In omnium's background script (`packages/omnium-gatherum/src/background.ts`), add:
    - `kernel.caplet.install(manifest, bundle)`: Install a Caplet
      - `manifest`: Caplet manifest object
      - `bundle`: Inline bundle JSON, file path, or URL
      - Returns: `Promise<{ capletId, subclusterId }>`
    - `kernel.caplet.list()`: List installed Caplets
      - Returns: `Promise<Array<{ id, name, version, subclusterId }>>`
    - `kernel.caplet.uninstall(capletId)`: Uninstall a Caplet
      - Terminates its subcluster and removes from storage
    - `kernel.service.list()`: List all registered services
      - Returns: `Promise<Array<{ capletId, serviceName }>>`
    - `kernel.service.get(serviceName)`: Get a service by name
      - Returns: `Promise<kref | undefined>`
  - Harden `kernel.caplet` and `kernel.service` objects

- [ ] **Example Usage in Console**

  - Create test Caplets in `packages/omnium-gatherum/test/fixtures/`:
    - `echo-caplet`: Simple Caplet that registers an "echo" service
    - `consumer-caplet`: Caplet that discovers and calls the "echo" service
  - Document console commands in `packages/omnium-gatherum/docs/dev-console-usage.md`:

    ```javascript
    // Install echo Caplet
    await kernel.caplet.install(
      {
        id: 'com.example.echo',
        name: 'Echo Service',
        version: '1.0.0',
        bundleSpec: '/path/to/echo.bundle',
        providedServices: ['echo'],
      },
      echoBundle,
    );

    // List installed Caplets
    await kernel.caplet.list();

    // List services
    await kernel.service.list();

    // Install consumer Caplet that uses echo
    await kernel.caplet.install(consumerManifest, consumerBundle);
    ```

#### 1.7 Testing

**Goal**: Validate that Caplets can be installed and communicate with each other.

- [ ] **Unit Tests**

  - `packages/omnium-gatherum/src/caplet/types.test.ts`: Validate manifest schema
  - `packages/omnium-gatherum/src/caplet/installer.test.ts`: Test installation logic
  - `packages/omnium-gatherum/src/services/service-registry.test.ts`: Test service registration/discovery

- [ ] **Integration Tests**

  - `packages/omnium-gatherum/test/caplet-integration.test.ts`:
    - Install two Caplets
    - Verify one can discover and call the other's service
    - Verify message passing works correctly
    - Test uninstallation

- [ ] **E2E Tests (Playwright)**
  - `packages/omnium-gatherum/test/e2e/caplet.spec.ts`:
    - Load omnium extension in browser
    - Use console to install Caplets
    - Verify they can communicate
    - Check DevTools console output

#### 1.8 Documentation

- [ ] **Architecture Documentation**

  - Create `packages/omnium-gatherum/docs/architecture.md`:
    - Explain how Caplets relate to subclusters and vats
    - Diagram showing omnium → kernel → Caplet subclusters
    - Userspace E() infrastructure
    - Phase 1: Direct reference passing vs Phase 2: Dynamic service discovery

- [ ] **Developer Guide**
  - Create `packages/omnium-gatherum/docs/caplet-development.md`:
    - How to write a Caplet vat
    - Service registration examples
    - Requesting services from other Caplets
    - Testing Caplets locally

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
