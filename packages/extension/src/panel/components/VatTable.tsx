import { useVats } from '../hooks/useVats.js';

/**
 * @returns A table of active vats.
 */
export const VatTable: React.FC = () => {
  const { vats, restartVat, terminateVat } = useVats();

  return (
    <div className="vat-management">
      <h3>Active Vats</h3>
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {vats.map((vat) => (
            <tr key={vat.id}>
              <td>{vat.name}</td>
              <td>
                <button onClick={() => restartVat(vat.id)}>Restart</button>
                <button onClick={() => terminateVat(vat.id)}>Terminate</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
