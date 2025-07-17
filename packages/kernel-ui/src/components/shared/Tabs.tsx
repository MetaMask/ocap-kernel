import { Box } from '@metamask/design-system-react';

export const Tabs: React.FC<{
  tabs: { label: string; value: string }[];
  activeTab: string;
  onTabChange: (tab: string) => void;
}> = ({ tabs, activeTab, onTabChange }) => {
  return (
    <Box
      className="flex overflow-hidden w-max w-full justify-start border-b border-muted mb-6"
      role="tablist"
    >
      {tabs.map((tab) => (
        <button
          className={`p-2 mx-2 font-medium border-b-2 focus:outline-none focus:ring-0 text-s-body-sm font-default select-none ${activeTab === tab.value ? 'text-primary-default border-primary-default' : 'border-transparent text-default hover:text-alternative'} `}
          role="tab"
          onClick={() => onTabChange(tab.value)}
          key={tab.value}
        >
          {tab.label}
        </button>
      ))}
    </Box>
  );
};
