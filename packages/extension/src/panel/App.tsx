import { LaunchVat } from './components/LaunchVat.jsx';
import { MessagePanel } from './components/MessagePanel.jsx';
import { VatTable } from './components/VatTable.jsx';
import { PanelProvider } from './context/PanelContext.jsx';
import { useStream } from './hooks/useStream.js';

export const App: React.FC = () => {
  const { sendMessage, error } = useStream();

  if (error) {
    return <div>Error connecting to kernel: {error.message}</div>;
  }

  if (!sendMessage) {
    return <div>Connecting to kernel...</div>;
  }

  return (
    <PanelProvider sendMessage={sendMessage}>
      <div className="kernel-panel">
        <LaunchVat />
        <VatTable />
        <MessagePanel />
      </div>
    </PanelProvider>
  );
};
