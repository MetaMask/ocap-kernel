import type { NonEmptyArray } from '@metamask/utils';
import { useState } from 'react';

import { ControlPanel } from './components/ControlPanel.tsx';
import { DatabaseInspector } from './components/DatabaseInspector.tsx';
import { MessagePanel } from './components/MessagePanel.tsx';
import { ObjectRegistry } from './components/ObjectRegistry.tsx';
import { Tabs } from './components/shared/Tabs.tsx';
import { PanelProvider } from './context/PanelContext.tsx';
import { useStream } from './hooks/useStream.ts';

const tabs: NonEmptyArray<{
  label: string;
  value: string;
  component: React.ReactNode;
}> = [
  { label: 'Control Panel', value: 'control', component: <ControlPanel /> },
  {
    label: 'Object Registry',
    value: 'registry',
    component: <ObjectRegistry />,
  },
  {
    label: 'Database Inspector',
    value: 'database',
    component: <DatabaseInspector />,
  },
];

export const App: React.FC = () => {
  const { callKernelMethod, error } = useStream();
  const [activeTab, setActiveTab] = useState(tabs[0].value);

  if (error) {
    return (
      <div className="panel">
        <div className="error">Error connecting to kernel: {error.message}</div>
      </div>
    );
  }

  if (!callKernelMethod) {
    return (
      <div className="panel">
        <div>Connecting to kernel...</div>
      </div>
    );
  }

  return (
    <PanelProvider callKernelMethod={callKernelMethod}>
      <div className="panel">
        <div className="leftPanel">
          <Tabs tabs={tabs} activeTab={activeTab} onTabChange={setActiveTab} />
          {tabs.find((tab) => tab.value === activeTab)?.component}
        </div>
        <div className="rightPanel">
          <MessagePanel />
        </div>
      </div>
    </PanelProvider>
  );
};
