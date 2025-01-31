import styles from '../App.module.css';
import { useVats } from '../hooks/useVats.js';

/**
 * @returns A table of active vats.
 */
export const VatTable: React.FC = () => {
  const { vats, restartVat, terminateVat, pingVat, resetVat } = useVats();

  if (vats.length === 0) {
    return null;
  }

  return (
    <div className={styles.table}>
      <table data-testid="vat-table">
        <thead>
          <tr>
            <th>ID</th>
            <th>Source</th>
            <th>Parameters</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {vats.map((vat) => (
            <tr key={vat.id}>
              <td>{vat.id}</td>
              <td>{vat.source}</td>
              <td>{vat.parameters}</td>
              <td>
                <div className={styles.tableActions}>
                  <button
                    className={styles.smallButton}
                    onClick={() => pingVat(vat.id)}
                  >
                    Ping
                  </button>
                  <button
                    className={styles.smallButton}
                    onClick={() => restartVat(vat.id)}
                  >
                    Restart
                  </button>
                  <button
                    className={styles.smallButton}
                    onClick={() => resetVat(vat.id)}
                  >
                    Reset
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
