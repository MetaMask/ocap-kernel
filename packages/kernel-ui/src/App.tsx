import {
  Box,
  Text as TextComponent,
  TextColor,
} from '@metamask/design-system-react';
import type { NonEmptyArray } from '@metamask/utils';
import { useState } from 'react';

import { ControlPanel } from './components/ControlPanel.tsx';
import { DatabaseInspector } from './components/DatabaseInspector.tsx';
import { MessagePanel } from './components/MessagePanel.tsx';
import { ObjectRegistry } from './components/ObjectRegistry.tsx';
import { RemoteComms } from './components/RemoteComms.tsx';
import { Tabs } from './components/shared/Tabs.tsx';
import { PanelProvider } from './context/PanelContext.tsx';
import { useDarkMode } from './hooks/useDarkMode.ts';
import { useStream } from './hooks/useStream.ts';

const panelStyle =
  'bg-background-default p-4 grid grid-cols-1 lg:grid-cols-[1fr_400px] gap-8 min-w-[650px] min-h-full';

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
  {
    label: 'Remote Comms',
    value: 'remote-comms',
    component: <RemoteComms />,
  },
];

export const App: React.FC = () => {
  const { callKernelMethod, error } = useStream();
  const [activeTab, setActiveTab] = useState(tabs[0].value);

  useDarkMode();

  if (error) {
    return (
      <Box className={panelStyle}>
        <TextComponent color={TextColor.ErrorDefault}>
          Error connecting to kernel: {error.message}
        </TextComponent>
      </Box>
    );
  }

  if (!callKernelMethod) {
    return (
      <Box className={panelStyle}>
        <TextComponent>Connecting to kernel...</TextComponent>
      </Box>
    );
  }

  return (
    <PanelProvider callKernelMethod={callKernelMethod}>
      <Box className={panelStyle}>
        <Box className="min-w-0">
          <Tabs tabs={tabs} activeTab={activeTab} onTabChange={setActiveTab} />
          {tabs.find((tab) => tab.value === activeTab)?.component}
        </Box>
        <Box className="sticky top-4 flex flex-col max-h-[calc(100vh-2rem)]">
          <MessagePanel />
        </Box>
      </Box>
    </PanelProvider>
  );
};
