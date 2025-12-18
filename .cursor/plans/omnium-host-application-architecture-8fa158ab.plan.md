---
name: Omnium Host Application Architecture Plan
overview: ''
todos:
  - id: 71afd73f-1bfb-4180-be77-f3fa2ac06f43
    content: Define caplet metadata schema with types for manifest, capabilities, and UI configuration
    status: pending
  - id: c2b17ac1-4971-4023-82bc-efac44366f29
    content: Implement storage service for persisting installed caplets and capability grants
    status: pending
  - id: 3a0c0bdc-4c03-4fce-8859-cb0cedbdbda1
    content: Implement caplet registry service for discovering and fetching caplets from npm/IPFS
    status: pending
  - id: 702cfa9f-5ec6-436e-b31c-657e489cc097
    content: Implement caplet installer service for installing, updating, and uninstalling caplets
    status: pending
  - id: c0246baf-dd4d-48ba-9751-583584386dac
    content: Implement capability manager for tracking and managing capability grants between caplets
    status: pending
  - id: 2ad5bf1b-93a6-43a7-87e5-cf39904c1e7a
    content: Implement caplet bootstrap service for launching caplets as subclusters with capability injection
    status: pending
  - id: a5c46f7c-78f7-4743-9482-ec7d37a20120
    content: Implement UI renderer service for securely rendering caplet UIs in isolated iframes
    status: pending
  - id: 90fae048-f547-425c-86c5-6171cbd0953c
    content: Create host shell UI components (CapletStore, InstalledCaplets, CapabilityManager, HostShell)
    status: pending
  - id: e99d2afb-fc80-4939-98ac-b1a9e5989f72
    content: Integrate all services in background script and connect to host shell UI
    status: pending
  - id: e09c5982-98d1-49ec-b693-8ba8ef56e408
    content: Add unit tests for services and E2E tests for caplet installation and UI rendering flows
    status: pending
---

# Omnium Host Application Architecture Plan

## Overview

The host application orchestrates "caplets" (collections of mutually suspicious vats/subclusters) published as npm packages. Caplets communicate via CapTP and need to render secure, isolated UIs. This plan outlines the components needed to build the host application on top of the existing ocap kernel infrastructure.

## Architecture Principles

- **Caplets as Subclusters**: Each caplet is launched as a subcluster containing one or more vats
- **Capability-Based Security**: Caplets request explicit capabilities; users approve/revoke them
- **Isolated UI Rendering**: Caplet UIs render in isolated contexts (iframes or shadow DOM) to prevent mutual interference
- **Host Orchestration**: The host manages caplet lifecycle, UI placement, and capability grants

## Components to Build

### 1. Caplet Metadata Schema (`packages/omnium-gatherum/src/types/caplet.ts`)

Define the structure for caplet packages:

```typescript
type CapletManifest = {
  name: string;
  version: string;
  description?: string;
  author?: string;
  bundleSpec: string; // URL or path to vat bundle(s)
  clusterConfig: ClusterConfig; // Subcluster configuration
  ui?: {
    entryPoint: string; // Path to UI component within bundle
    mountPoint?: string; // Where to render (e.g., 'popup', 'sidebar', 'modal')
  };
  capabilities?: {
    requested: CapabilityRequest[];
    provided?: CapabilityDefinition[];
  };
  registry?: {
    source: 'npm' | 'ipfs' | 'url';
    location: string;
  };
};
```

### 2. Caplet Registry Service (`packages/omnium-gatherum/src/services/caplet-registry.ts`)

Service for discovering and fetching caplets from registries:

- **Methods**:

  - `discoverCaplets(registryUrl?: string)`: Query registry for available caplets
  - `fetchCapletManifest(source, location)`: Fetch caplet metadata from a source (url, npm, ipfs)
  - `fetchCapletBundle(bundleSpec)`: Download caplet bundle(s) from any supported source
  - `addRegistry(url)`: Add a new registry source
  - `removeRegistry(url)`: Remove a registry source

- **Implementation Notes**:
  - Use a plugin/strategy pattern for extensible source support
  - Implement `UrlBundleFetcher`, `NpmBundleFetcher`, `IpfsBundleFetcher` (future)
  - Support direct URL fetching for caplet bundles (e.g., `https://example.com/caplet.bundle`)
  - Support npm packages (fetch from npm registry)
  - Support IPFS CIDs for decentralized distribution (future)
  - Validate manifest structure using `@metamask/superstruct`
  - Cache fetched manifests and bundles

### 3. Caplet Installer (`packages/omnium-gatherum/src/services/caplet-installer.ts`)

Handles caplet installation, validation, and configuration:

- **Methods**:

  - `installCaplet(manifest, userApprovals?)`: Install a caplet with user capability approvals
  - `uninstallCaplet(capletId)`: Remove a caplet and its subcluster
  - `updateCaplet(capletId, newVersion)`: Update to a new version
  - `validateCaplet(manifest)`: Validate manifest structure and bundle accessibility

- **Implementation Notes**:
  - Store installed caplets in extension storage (chrome.storage.local)
  - Create subcluster configuration from caplet manifest
  - Launch subcluster via kernel API after installation
  - Track installed versions and update paths

### 4. Capability Manager (`packages/omnium-gatherum/src/services/capability-manager.ts`)

Manages capability grants between caplets and kernel services:

- **Methods**:

  - `requestCapability(capletId, capability)`: Request a capability grant
  - `grantCapability(capletId, capability, target)`: Grant capability to caplet
  - `revokeCapability(capletId, capability)`: Revoke a previously granted capability
  - `listCapabilities(capletId)`: List all capabilities granted to a caplet
  - `attenuateCapability(original, restrictions)`: Create an attenuated capability

- **Implementation Notes**:
  - Store capability grants in extension storage
  - Capabilities are object references (KRefs) passed to caplets during bootstrap
  - Support capability attenuation (time limits, scope restrictions)
  - Track capability dependencies between caplets

### 5. UI Renderer Service (`packages/omnium-gatherum/src/services/ui-renderer.ts`)

Securely renders caplet UIs in isolated contexts:

- **Methods**:

  - `renderCapletUI(capletId, mountPoint, container)`: Render a caplet's UI
  - `unmountCapletUI(capletId)`: Remove a caplet's UI
  - `createUICapability(capletId)`: Create a capability for UI rendering

- **Implementation Approach**:

  - **Option A (Iframe-based)**: Render each caplet UI in a sandboxed iframe
    - Use existing `makeIframeVatWorker` pattern but for UI rendering
    - Create dedicated UI iframe HTML files per caplet
    - Communicate via message ports (similar to vat communication)
  - **Option B (Shadow DOM + React Portal)**: Use Shadow DOM for isolation
    - Render React components in Shadow DOM containers
    - Use React portals to mount caplet components
    - Less isolation but simpler integration with React

- **Recommendation**: Start with Option A (iframe-based) for stronger isolation, similar to how vats are isolated

### 6. Host Shell UI (`packages/omnium-gatherum/src/ui/`)

Main UI components for managing caplets:

- **Components**:

  - `CapletStore.tsx`: Browse and install caplets from registries
  - `InstalledCaplets.tsx`: List installed caplets, manage lifecycle
  - `CapabilityManager.tsx`: View and manage capability grants
  - `CapletSettings.tsx`: Configure individual caplet settings
  - `HostShell.tsx`: Main shell that orchestrates UI placement

- **Integration**:
  - Extend existing `App.tsx` in `packages/omnium-gatherum/src/ui/App.tsx`
  - Use `@metamask/kernel-ui` components for consistency
  - Integrate with kernel RPC via existing `useKernelActions` pattern

### 7. Caplet Bootstrap Service (`packages/omnium-gatherum/src/services/caplet-bootstrap.ts`)

Coordinates caplet initialization and capability injection:

- **Methods**:

  - `bootstrapCaplet(capletId, clusterConfig, capabilities)`: Launch caplet subcluster with capabilities
  - `injectCapabilities(subclusterId, capabilities)`: Inject capabilities into running caplet
  - `getCapletRoot(capletId)`: Get root object reference for a caplet

- **Implementation Notes**:
  - Use kernel's `launchSubcluster` API
  - Pass capabilities as kernel services or via bootstrap parameters
  - Track caplet subcluster IDs for lifecycle management

### 8. Storage Service (`packages/omnium-gatherum/src/services/storage.ts`)

Manages persistent state for caplets and host:

- **Methods**:

  - `saveInstalledCaplets(caplets)`: Persist installed caplet list
  - `loadInstalledCaplets()`: Load installed caplets on startup
  - `saveCapabilityGrants(grants)`: Persist capability grants
  - `loadCapabilityGrants()`: Load capability grants on startup

- **Implementation Notes**:
  - Use `chrome.storage.local` for browser extension
  - Structure data for efficient querying
  - Handle migration for schema changes

## Implementation Order

1. **Phase 1: Foundation**

   - Define caplet metadata schema (`types/caplet.ts`)
   - Implement storage service
   - Create basic host shell UI structure

2. **Phase 2: Core Services**

   - Implement caplet registry service (npm support)
   - Implement caplet installer
   - Implement capability manager

3. **Phase 3: UI Rendering**

   - Implement UI renderer service (iframe-based)
   - Create UI iframe template for caplets
   - Integrate UI rendering into host shell

4. **Phase 4: Integration**

   - Implement caplet bootstrap service
   - Connect all services in host shell
   - Add caplet lifecycle management UI

5. **Phase 5: Polish**

   - Add capability approval UI flows
   - Implement caplet update mechanism
   - Add error handling and user feedback

## Key Design Decisions

### Caplet Communication

- Caplets communicate via CapTP using ocap URLs (as seen in `remote-comms.test.ts`)
- The host provides kernel services that caplets can request
- Caplets can request references to other caplets' root objects

### UI Isolation Strategy

- Use iframe-based isolation (similar to vat isolation)
- Each caplet UI runs in its own sandboxed iframe
- Communication via message ports with capability-based access control
- Host controls where UI is mounted (popup, sidebar, etc.)

### Capability Model

- Capabilities are object references (KRefs) passed during bootstrap
- Users approve capability requests before installation
- Capabilities can be revoked at any time
- Capabilities can be attenuated (time-limited, scope-restricted)

## Files to Create/Modify

### New Files

- `packages/omnium-gatherum/src/types/caplet.ts` - Caplet type definitions
- `packages/omnium-gatherum/src/services/caplet-registry.ts` - Registry service
- `packages/omnium-gatherum/src/services/caplet-installer.ts` - Installer service
- `packages/omnium-gatherum/src/services/capability-manager.ts` - Capability management
- `packages/omnium-gatherum/src/services/ui-renderer.ts` - UI rendering service
- `packages/omnium-gatherum/src/services/caplet-bootstrap.ts` - Bootstrap service
- `packages/omnium-gatherum/src/services/storage.ts` - Storage service
- `packages/omnium-gatherum/src/ui/CapletStore.tsx` - Caplet store UI
- `packages/omnium-gatherum/src/ui/InstalledCaplets.tsx` - Installed caplets UI
- `packages/omnium-gatherum/src/ui/CapabilityManager.tsx` - Capability management UI
- `packages/omnium-gatherum/src/ui/HostShell.tsx` - Main shell component
- `packages/omnium-gatherum/src/ui/caplet-iframe.html` - Template for caplet UI iframes

### Modified Files

- `packages/omnium-gatherum/src/ui/App.tsx` - Integrate host shell
- `packages/omnium-gatherum/src/background.ts` - Initialize host services
- `packages/omnium-gatherum/src/offscreen.ts` - Ensure kernel is available for caplets

## Testing Strategy

- Unit tests for each service using vitest
- Integration tests for caplet installation and lifecycle
- E2E tests using Playwright for UI flows
- Test capability grants and revocation
- Test UI isolation between caplets

## Open Questions

1. **UI Framework**: Should caplets be required to use React, or support multiple frameworks?

   - Recommendation: Start with React support, add others later

2. **Caplet Bundle Format**: Should caplets include UI code in the same bundle as vats, or separate?

   - Recommendation: Separate UI bundles initially for clarity

3. **Capability Discovery**: How do caplets discover what capabilities are available?

   - Recommendation: Host provides a capability registry service that caplets can query

4. **UI Mount Points**: What are the standard mount points for caplet UIs?

   - Recommendation: Start with 'popup', 'sidebar', 'modal', allow custom later
