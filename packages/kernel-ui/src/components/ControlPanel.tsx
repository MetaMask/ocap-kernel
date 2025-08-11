import { KernelControls } from './KernelControls.tsx';
import { LaunchSubcluster } from './LaunchSubcluster.tsx';
import { SubclustersTable } from './SubclustersTable.tsx';

export const ControlPanel: React.FC = () => {
  return (
    <>
      <KernelControls />
      <SubclustersTable />
      <LaunchSubcluster />
    </>
  );
};
