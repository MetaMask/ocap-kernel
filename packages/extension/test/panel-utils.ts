import fs from 'fs/promises';
import path, { dirname } from 'path';
import { fileURLToPath } from 'url';

/**
 * Setup the DOM for the tests.
 */
export async function setupPanelDOM(): Promise<void> {
  const htmlPath = path.resolve(
    dirname(fileURLToPath(import.meta.url)),
    '../src/popup.html',
  );
  const html = await fs.readFile(htmlPath, 'utf-8');
  document.body.innerHTML = html;

  // Add test option to select
  const vatSelect = document.getElementById('vat-id') as HTMLSelectElement;
  const option = document.createElement('option');
  option.value = 'v0';
  option.text = 'v0';
  vatSelect.appendChild(option);
}
