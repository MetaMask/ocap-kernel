import { ConfigEditor } from './ConfigEditor.js';
import { KernelControls } from './KernelControls.jsx';
import { LaunchVat } from './LaunchVat.jsx';
import { VatTable } from './VatTable.jsx';
import styles from '../App.module.css';

export const VatManager: React.FC = () => {
  return (
    <>
      <div className={styles.headerSection}>
        <h2>Kernel Vats</h2>
        <KernelControls />
      </div>
      <VatTable />
      <LaunchVat />
      <ConfigEditor />
    </>
  );
};
