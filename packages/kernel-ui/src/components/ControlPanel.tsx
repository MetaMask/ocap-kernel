import { KernelControls } from './KernelControls.tsx';
import { LaunchSubcluster } from './LaunchSubcluster.tsx';
import { SubclustersTable } from './SubclustersTable.tsx';
import styles from '../App.module.css';

export const ControlPanel: React.FC = () => {
  return (
    <>
      <div className={styles.headerSection}>
        <h2 className={styles.noMargin}>Kernel</h2>
        <KernelControls />
      </div>
      <SubclustersTable />
      <LaunchSubcluster />
    </>
  );
};
