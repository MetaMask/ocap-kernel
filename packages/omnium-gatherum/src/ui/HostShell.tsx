import {
  Box,
  Text as TextComponent,
  TextVariant,
  TextColor,
} from '@metamask/design-system-react';
import { useState } from 'react';

import { CapabilityManager } from './CapabilityManager.tsx';
import { CapletStore } from './CapletStore.tsx';
import { InstalledCaplets } from './InstalledCaplets.tsx';

type Tab = 'store' | 'installed' | 'capabilities';

/**
 * Main shell component that orchestrates UI placement and manages caplets.
 */
export const HostShell: React.FC = () => {
  const [activeTab, setActiveTab] = useState<Tab>('installed');
  const [showCapletUI, setShowCapletUI] = useState(false);

  return (
    <Box className="flex flex-col h-full">
      {/* Header */}
      <Box className="p-4 border-b border-muted">
        <TextComponent
          variant={TextVariant.HeadingLg}
          color={TextColor.TextDefault}
          className="mb-2"
        >
          Omnium Gatherum
        </TextComponent>
        <TextComponent variant={TextVariant.BodySm} color={TextColor.TextMuted}>
          Caplet Host Application
        </TextComponent>
      </Box>

      {/* Tabs */}
      <Box className="flex border-b border-muted">
        <button
          onClick={() => setActiveTab('store')}
          className={`px-4 py-2 ${
            activeTab === 'store'
              ? 'border-b-2 border-primary-default text-primary-default'
              : 'text-text-muted hover:text-text-default'
          }`}
        >
          <TextComponent variant={TextVariant.BodyMd}>Store</TextComponent>
        </button>
        <button
          onClick={() => setActiveTab('installed')}
          className={`px-4 py-2 ${
            activeTab === 'installed'
              ? 'border-b-2 border-primary-default text-primary-default'
              : 'text-text-muted hover:text-text-default'
          }`}
        >
          <TextComponent variant={TextVariant.BodyMd}>Installed</TextComponent>
        </button>
        <button
          onClick={() => setActiveTab('capabilities')}
          className={`px-4 py-2 ${
            activeTab === 'capabilities'
              ? 'border-b-2 border-primary-default text-primary-default'
              : 'text-text-muted hover:text-text-default'
          }`}
        >
          <TextComponent variant={TextVariant.BodyMd}>
            Capabilities
          </TextComponent>
        </button>
      </Box>

      {/* Content */}
      <Box className="flex-1 overflow-auto">
        {activeTab === 'store' && <CapletStore />}
        {activeTab === 'installed' && <InstalledCaplets />}
        {activeTab === 'capabilities' && <CapabilityManager />}
      </Box>

      {/* Caplet UI Container */}
      {showCapletUI && (
        <Box
          id="caplet-ui-container"
          className="border-t border-muted p-4"
          style={{ height: '300px' }}
        />
      )}
    </Box>
  );
};
