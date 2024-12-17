import styles from '../App.module.css';
import { useVats } from '../hooks/useVats.js';

/**
 * @returns A table of active vats.
 */
export const VatTable: React.FC = () => {
  const { vats, restartVat, terminateVat } = useVats();

  if (vats.length === 0) {
    return null;
  }

  return (
    <div className={styles.vatTable}>
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>ID</th>
            <th>Source</th>
            <th>Parameters</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {vats.map((vat, index) => (
            <tr key={vat.id}>
              <td>{index + 1}</td>
              <td>{vat.id}</td>
              <td>{vat.source}</td>
              <td>{vat.parameters}</td>
              <td>
                <div className={styles.tableActions}>
                  <button
                    className={styles.smallButton}
                    onClick={() => restartVat(vat.id)}
                  >
                    Restart
                  </button>
                  <button
                    className={styles.smallButton}
                    onClick={() => terminateVat(vat.id)}
                  >
                    Terminate
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
