import styles from '../App.module.css';
import type { VatRecord } from '../types.ts';

export const VatTable: React.FC<{
  vats: VatRecord[];
  onPingVat: (id: string) => void;
  onRestartVat: (id: string) => void;
  onTerminateVat: (id: string) => void;
}> = ({ vats, onPingVat, onRestartVat, onTerminateVat }) => {
  if (vats.length === 0) {
    return null;
  }

  return (
    <div className={`${styles.table} ${styles.subclusterTable}`}>
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
            <tr key={vat.id} data-vat-id={vat.id}>
              <td>{vat.id}</td>
              <td>{vat.source}</td>
              <td>{vat.parameters}</td>
              <td>
                <div className={styles.tableActions}>
                  <button
                    className={styles.smallButton}
                    onClick={() => onPingVat(vat.id)}
                  >
                    Ping
                  </button>
                  <button
                    className={styles.smallButton}
                    onClick={() => onRestartVat(vat.id)}
                  >
                    Restart
                  </button>
                  <button
                    className={styles.smallButton}
                    onClick={() => onTerminateVat(vat.id)}
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
