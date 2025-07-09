export const Tabs: React.FC<{
  tabs: { label: string; value: string }[];
  activeTab: string;
  onTabChange: (tab: string) => void;
}> = ({ tabs, activeTab, onTabChange }) => {
  return (
    <div className="tabButtons">
      {tabs.map((tab) => (
        <button
          className={`tabButton ${activeTab === tab.value ? 'activeTab' : ''}`}
          onClick={() => onTabChange(tab.value)}
          key={tab.value}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
};
