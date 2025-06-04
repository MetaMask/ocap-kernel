import styles from '../../App.module.css';

export const Tabs: React.FC<{
  tabs: { label: string; value: string }[];
  activeTab: string;
  onTabChange: (tab: string) => void;
}> = ({ tabs, activeTab, onTabChange }) => {
  return (
    <div className={styles.tabButtons}>
      {tabs.map((tab) => (
        <button
          className={`${styles.tabButton} ${
            activeTab === tab.value ? styles.activeTab : ''
          }`}
          onClick={() => onTabChange(tab.value)}
          key={tab.value}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
};
