import { ConfigEditor } from './ConfigEditor.tsx';
import { KernelControls } from './KernelControls.tsx';
import { LaunchVat } from './LaunchVat.tsx';
import { VatTable } from './VatTable.tsx';
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
