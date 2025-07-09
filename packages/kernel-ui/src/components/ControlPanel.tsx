import { KernelControls } from './KernelControls.tsx';
import { LaunchSubcluster } from './LaunchSubcluster.tsx';
import { SubclustersTable } from './SubclustersTable.tsx';

export const ControlPanel: React.FC = () => {
  return (
    <>
      <div className="headerSection">
        <h2 className="noMargin">Kernel</h2>
        <KernelControls />
      </div>
      <SubclustersTable />
      <LaunchSubcluster />
    </>
  );
};
