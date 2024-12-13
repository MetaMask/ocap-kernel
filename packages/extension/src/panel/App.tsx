import React from 'react';

import { LaunchVat } from './components/LaunchVat.jsx';
import { MessagePanel } from './components/MessagePanel.jsx';
import { VatTable } from './components/VatTable.jsx';
import { PanelProvider } from './context/PanelContext.jsx';

export const App: React.FC = () => {
  return (
    <PanelProvider>
      <div className="kernel-panel">
        <LaunchVat />
        <VatTable />
        <MessagePanel />
      </div>
    </PanelProvider>
  );
};
