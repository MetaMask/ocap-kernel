import styles from './App.module.css';
import { KernelControls } from './components/KernelControls.jsx';
import { LaunchVat } from './components/LaunchVat.jsx';
import { MessagePanel } from './components/MessagePanel.jsx';
import { VatTable } from './components/VatTable.jsx';
import { PanelProvider } from './context/PanelContext.jsx';
import { useStream } from './hooks/useStream.js';

export const App: React.FC = () => {
  const { sendMessage, error } = useStream();

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
          <div className={styles.headerSection}>
            <h2>Kernel Vats</h2>
            <KernelControls />
          </div>
          <VatTable />
          <LaunchVat />
        </div>
        <div className={styles.rightPanel}>
          <MessagePanel />
        </div>
      </div>
    </PanelProvider>
  );
};
