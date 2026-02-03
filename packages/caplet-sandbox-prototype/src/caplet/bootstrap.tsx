import { render } from 'preact';

import { initBridge } from './caplet-bridge.ts';

/**
 * Gets the capletId from URL query parameters.
 *
 * @returns The capletId or throws if not found.
 */
function getCapletIdFromUrl(): string {
  const params = new URLSearchParams(window.location.search);
  const capletId = params.get('capletId');
  if (!capletId) {
    throw new Error('Missing capletId in URL query parameters');
  }
  return capletId;
}

/**
 * Bootstraps a caplet by initializing the bridge and rendering the app.
 *
 * @param AppComponent - The Preact component to render.
 */
export async function bootstrapCaplet(
  AppComponent: () => preact.JSX.Element,
): Promise<void> {
  const capletId = getCapletIdFromUrl();
  const bridge = initBridge(capletId);

  await bridge.waitForInit();

  const appElement = document.getElementById('app');
  if (!appElement) {
    throw new Error('App element not found');
  }

  render(<AppComponent />, appElement);
}
