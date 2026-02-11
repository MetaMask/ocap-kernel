import type { KernelDatabase } from '@metamask/kernel-store';
import { stringify } from '@metamask/kernel-utils';
import { Kernel, kunser, makeKernelStore } from '@metamask/ocap-kernel';
import type {
  ClusterConfig,
  KRef,
  RemoteCommsOptions,
} from '@metamask/ocap-kernel';

import { makeTestKernel } from './kernel.ts';

/**
 * Helper to create a vat configuration for a remote vat.
 *
 * @param name - The name of the vat (e.g., 'alice', 'bob', 'charlie').
 * @returns Cluster configuration for the vat.
 */
export function makeRemoteVatConfig(name: string): ClusterConfig {
  return {
    bootstrap: name,
    services: ['ocapURLIssuerService', 'ocapURLRedemptionService'],
    vats: {
      [name]: {
        bundleSpec: 'http://localhost:3000/remote-vat.bundle',
        parameters: { name },
      },
    },
  };
}

/**
 * Get peer IDs from both kernels.
 *
 * @param kernel1 - First kernel.
 * @param kernel2 - Second kernel.
 * @returns Object with peerId1 and peerId2.
 */
export async function getPeerIds(
  kernel1: Kernel,
  kernel2: Kernel,
): Promise<{ peerId1: string; peerId2: string }> {
  const status1 = await kernel1.getStatus();
  const status2 = await kernel2.getStatus();
  const rc1 = status1.remoteComms;
  const rc2 = status2.remoteComms;
  const peerId1 = rc1 && rc1.state !== 'disconnected' ? rc1.peerId : undefined;
  const peerId2 = rc2 && rc2.state !== 'disconnected' ? rc2.peerId : undefined;

  if (!peerId1 || !peerId2) {
    throw new Error('Peer IDs not available');
  }

  return { peerId1, peerId2 };
}

/**
 * Launch a vat and get its ocap URL.
 *
 * @param kernel - The kernel to launch the vat in.
 * @param config - Cluster configuration for the vat.
 * @returns The ocap URL string.
 */
export async function launchVatAndGetURL(
  kernel: Kernel,
  config: ClusterConfig,
): Promise<string> {
  const { bootstrapResult } = await kernel.launchSubcluster(config);
  if (!bootstrapResult) {
    throw new Error(
      `No bootstrap result for vat "${config.bootstrap}" with config ${stringify(config)}`,
    );
  }
  return kunser(bootstrapResult) as string;
}

/**
 * Get a vat's root reference by name.
 *
 * @param kernel - The kernel containing the vat.
 * @param kernelStore - The kernel store for the kernel.
 * @param name - The name of the vat.
 * @returns The root reference (KRef) for the vat.
 */
export function getVatRootRef(
  kernel: Kernel,
  kernelStore: ReturnType<typeof makeKernelStore>,
  name: string,
): KRef {
  const vats = kernel.getVats();
  const foundVat = vats.find((vat) => vat.config.parameters?.name === name);
  if (!foundVat) {
    const vatNames = vats
      .map((vatItem) => vatItem.config.parameters?.name)
      .filter((vatName): vatName is string => typeof vatName === 'string')
      .join(', ');
    throw new Error(
      `Vat with name "${name}" not found. Available vats: ${vatNames || 'none'}`,
    );
  }
  const rootRef = kernelStore.getRootObject(foundVat.id);
  if (!rootRef) {
    throw new Error(
      `Root object not found for vat "${name}" (id: ${foundVat.id})`,
    );
  }
  return rootRef;
}

/**
 * Send a remote message and get the response.
 *
 * @param kernel - The kernel to send from.
 * @param rootRef - The root reference of the sending vat.
 * @param remoteURL - The ocap URL of the remote vat.
 * @param message - The message to send.
 * @param hints - Optional hints for the message.
 * @returns The response string.
 */
export async function sendRemoteMessage(
  kernel: Kernel,
  rootRef: KRef,
  remoteURL: string,
  message: string,
  hints: string[] = [],
): Promise<string> {
  const result = await kernel.queueMessage(rootRef, 'sendRemoteMessage', [
    remoteURL,
    message,
    hints,
  ]);
  return kunser(result) as string;
}

/**
 * Restart a kernel with the same database.
 *
 * @param kernelDatabase - The kernel database to use.
 * @param resetStorage - Whether to reset storage.
 * @param relays - Array of relay addresses.
 * @returns The restarted kernel.
 */
export async function restartKernel(
  kernelDatabase: KernelDatabase,
  resetStorage: boolean,
  relays: string[],
): Promise<Kernel> {
  const kernel = await makeTestKernel(kernelDatabase, { resetStorage });
  await kernel.initRemoteComms({ relays });
  return kernel;
}

/**
 * Restart a kernel and relaunch its vat.
 *
 * @param kernelDatabase - The kernel database to use.
 * @param resetStorage - Whether to reset storage.
 * @param relays - Array of relay addresses.
 * @param config - Cluster configuration for the vat.
 * @returns Object with the restarted kernel and its ocap URL.
 */
export async function restartKernelAndReloadVat(
  kernelDatabase: KernelDatabase,
  resetStorage: boolean,
  relays: string[],
  config: ClusterConfig,
): Promise<{ kernel: Kernel; url: string }> {
  const kernel = await restartKernel(kernelDatabase, resetStorage, relays);
  const url = await launchVatAndGetURL(kernel, config);
  return { kernel, url };
}

/**
 * Wait for a specified amount of time.
 *
 * @param ms - Milliseconds to wait.
 * @returns Promise that resolves after the specified time.
 */
export async function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Setup two kernels with Alice and Bob vats, initialized and connected.
 *
 * @param kernel1 - First kernel.
 * @param kernel2 - Second kernel.
 * @param kernelStore1 - Kernel store for first kernel.
 * @param kernelStore2 - Kernel store for second kernel.
 * @param relays - Array of relay addresses.
 * @param remoteCommsOptions - Optional additional options for initRemoteComms.
 * @returns Object with all setup data including URLs and references.
 */
export async function setupAliceAndBob(
  kernel1: Kernel,
  kernel2: Kernel,
  kernelStore1: ReturnType<typeof makeKernelStore>,
  kernelStore2: ReturnType<typeof makeKernelStore>,
  relays: string[],
  remoteCommsOptions?: Omit<RemoteCommsOptions, 'relays'>,
): Promise<{
  aliceURL: string;
  bobURL: string;
  aliceRef: KRef;
  bobRef: KRef;
  peerId1: string;
  peerId2: string;
}> {
  await kernel1.initRemoteComms({ relays, ...remoteCommsOptions });
  await kernel2.initRemoteComms({ relays, ...remoteCommsOptions });

  const aliceConfig = makeRemoteVatConfig('Alice');
  const bobConfig = makeRemoteVatConfig('Bob');

  const aliceURL = await launchVatAndGetURL(kernel1, aliceConfig);
  const bobURL = await launchVatAndGetURL(kernel2, bobConfig);

  const aliceRef = getVatRootRef(kernel1, kernelStore1, 'Alice');
  const bobRef = getVatRootRef(kernel2, kernelStore2, 'Bob');

  const { peerId1, peerId2 } = await getPeerIds(kernel1, kernel2);

  return {
    aliceURL,
    bobURL,
    aliceRef,
    bobRef,
    peerId1,
    peerId2,
  };
}

/**
 * Create a test subcluster configuration for a MaaS server vat.
 *
 * @param name - The name of the vat.
 * @param forceReset - True if cluster should reset on start
 * @returns Cluster configuration to run a MaaS server.
 */
export function makeMaasServerConfig(
  name: string,
  forceReset: boolean,
): ClusterConfig {
  return {
    bootstrap: 'maasServer',
    forceReset,
    services: ['ocapURLIssuerService'],
    vats: {
      maasServer: {
        bundleSpec: 'http://localhost:3000/monotonous-vat.bundle',
        parameters: {
          name,
        },
      },
    },
  };
}

/**
 * Create a test subcluster configuration for a MaaS client vat.
 *
 * @param name - The name of the vat.
 * @param forceReset - True if cluster should reset on start
 * @returns Cluster configuration to run a MaaS client.
 */
export function makeMaasClientConfig(
  name: string,
  forceReset: boolean,
): ClusterConfig {
  return {
    bootstrap: 'maasClient',
    forceReset,
    services: ['ocapURLRedemptionService'],
    vats: {
      maasClient: {
        bundleSpec: 'http://localhost:3000/stepper-upper-vat.bundle',
        parameters: {
          name,
        },
      },
    },
  };
}
