import { useCallback, useState } from 'react';

import { KernelControlMethod } from '../../kernel-integration/messages.js';
import type { KernelControlCommand } from '../../kernel-integration/messages.js';
import { usePanelContext } from '../context/PanelContext.js';
import { isValidBundleUrl } from '../utils.js';

/**
 * Hook to manage the vat form state.
 *
 * @returns An object containing the bundle URL and new vat name, and functions to set them.
 */
export const useVatForm = (): {
  bundleUrl: string;
  setBundleUrl: (url: string) => void;
  newVatName: string;
  setNewVatName: (name: string) => void;
  handleLaunch: () => void;
  isDisabled: boolean;
} => {
  const { sendMessage, showOutput } = usePanelContext();
  const [bundleUrl, setBundleUrl] = useState<string>('');
  const [newVatName, setNewVatName] = useState<string>('');

  // Launch a vat
  const handleLaunch = useCallback(() => {
    if (!isValidBundleUrl(bundleUrl)) {
      showOutput('Invalid bundle URL', 'error');
      return;
    }

    if (!newVatName.trim()) {
      showOutput('Vat name is required', 'error');
      return;
    }

    const message: KernelControlCommand = {
      method: KernelControlMethod.launchVat,
      params: {
        bundleSpec: bundleUrl,
        parameters: {
          name: newVatName,
        },
      },
    };

    sendMessage(message)
      .then(() => {
        showOutput(`Launched vat "${newVatName}"`, 'success');
        return setNewVatName('');
      })
      .catch((error) => {
        console.error(`Failed to launch vat "${newVatName}":`, error);
      });
  }, [bundleUrl, newVatName, sendMessage, setNewVatName, showOutput]);

  const isDisabled = !newVatName.trim() || !isValidBundleUrl(bundleUrl);

  return {
    bundleUrl,
    setBundleUrl,
    newVatName,
    setNewVatName,
    handleLaunch,
    isDisabled,
  };
};
