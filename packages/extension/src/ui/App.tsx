import { useState } from 'react';

import styles from './App.module.css';
import { DatabaseInspector } from './components/DatabaseInspector.jsx';
import { MessagePanel } from './components/MessagePanel.jsx';
import { Tabs } from './components/Tabs.jsx';
import { VatManager } from './components/VatManager.jsx';
import { PanelProvider } from './context/PanelContext.jsx';
import { useStream } from './hooks/useStream.js';

export const App: React.FC = () => {
  const { sendMessage, error } = useStream();
  const [activeTab, setActiveTab] = useState('vats');

  if (error) {
    return (
      <div className={styles.panel}>
        <div className={styles.error}>
          Error connecting to kernel: {error.message}
        </div>
      </div>
    );
  }

  if (!sendMessage) {
    return (
      <div className={styles.panel}>
        <div>Connecting to kernel...</div>
      </div>
    );
  }

  return (
    <PanelProvider sendMessage={sendMessage}>
      <div className={styles.panel}>
        <div className={styles.leftPanel}>
          <Tabs
            tabs={[
              { label: 'Vat Manager', value: 'vats' },
              { label: 'Database Inspector', value: 'database' },
            ]}
            activeTab={activeTab}
            onTabChange={setActiveTab}
          />
          {activeTab === 'vats' ? <VatManager /> : <DatabaseInspector />}
        </div>
        <div className={styles.rightPanel}>
          <MessagePanel />
        </div>
      </div>
    </PanelProvider>
  );
};
