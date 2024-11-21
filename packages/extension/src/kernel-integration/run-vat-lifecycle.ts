import type { NonEmptyArray } from '@metamask/utils';
import { Kernel /*, VatCommandMethod */ } from '@ocap/kernel';
import type { /* VatId, */ VatConfig } from '@ocap/kernel';

// XXX This is temporarily disabled until vat restart is once again a thing

/**
 * Runs the full lifecycle of an array of vats
 *
 * @param _kernel - The kernel instance.
 * @param _vats - The vats to run the lifecycle for.
 */
export async function runVatLifecycle(
  _kernel: Kernel,
  _vats: NonEmptyArray<VatConfig>,
): Promise<void> {
  /*
  console.time(`Created vats: ${vats.join(', ')}`);
  await Promise.all(vats.map(async (config) => kernel.launchVat(config)));
  console.timeEnd(`Created vats: ${vats.join(', ')}`);

  console.log('Kernel vats:', kernel.getVatIds().join(', '));

  // Restart a randomly selected vat from the array.
  const vatToRestart = vats[Math.floor(Math.random() * vats.length)] as VatId;
  console.time(`Vat "${vatToRestart}" restart`);
  await kernel.restartVat(vatToRestart);
  console.timeEnd(`Vat "${vatToRestart}" restart`);

  // Send a "Ping" message to a randomly selected vat.
  const vatToPing = vats[Math.floor(Math.random() * vats.length)] as VatId;
  console.time(`Ping Vat "${vatToPing}"`);
  await kernel.sendMessage(vatToPing, {
    method: VatCommandMethod.ping,
    params: null,
  });
  console.timeEnd(`Ping Vat "${vatToPing}"`);

  const vatIds = kernel.getVatIds().join(', ');
  console.time(`Terminated vats: ${vatIds}`);
  await kernel.terminateAllVats();
  console.timeEnd(`Terminated vats: ${vatIds}`);

  console.log(`Kernel has ${kernel.getVatIds().length} vats`);
  */
}
