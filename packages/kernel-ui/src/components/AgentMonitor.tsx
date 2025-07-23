import { Chat } from './Chat.tsx';
import { AgentControls } from './AgentControls.tsx';
import styles from '../App.module.css';

export const AgentMonitor: React.FC = () => {
  return (
    <div className={styles.headerSection}>
      <h2 className={styles.noMargin}>Agents</h2>
      <AgentControls />
      <Chat />
    </div>
  );
};
