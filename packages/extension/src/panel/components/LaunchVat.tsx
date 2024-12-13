import React from 'react';

import { useVatForm } from '../hooks/useVatForm.js';

/**
 * @returns A panel for launching a vat.
 */
export const LaunchVat: React.FC = () => {
  const {
    bundleUrl,
    newVatName,
    setBundleUrl,
    setNewVatName,
    handleLaunch,
    isDisabled,
  } = useVatForm();

  return (
    <div className="vat-controls">
      <input
        type="text"
        value={newVatName}
        onChange={(error) => setNewVatName(error.target.value)}
        placeholder="Vat Name"
      />
      <input
        type="url"
        value={bundleUrl}
        onChange={(error) => setBundleUrl(error.target.value)}
        placeholder="Bundle URL"
      />
      <button onClick={handleLaunch} disabled={isDisabled}>
        Launch Vat
      </button>
    </div>
  );
};
