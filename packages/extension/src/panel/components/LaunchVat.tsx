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
        onChange={(event) => setNewVatName(event.target.value)}
        placeholder="Vat Name"
      />
      <input
        type="url"
        value={bundleUrl}
        onChange={(event) => setBundleUrl(event.target.value)}
        placeholder="Bundle URL"
      />
      <button onClick={handleLaunch} disabled={isDisabled}>
        Launch Vat
      </button>
    </div>
  );
};
