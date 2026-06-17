import { useState } from 'react';

import { ArtifactPanel } from './components/ArtifactPanel.tsx';
import { ArtifactZoom } from './components/ArtifactZoom.tsx';
import { ServicesGrid } from './components/ServicesGrid.tsx';
import { Transcript } from './components/Transcript.tsx';
import { WalletRibbon } from './components/WalletRibbon.tsx';
import { WorkflowBoard } from './components/WorkflowBoard.tsx';
import { useEventStream } from './hooks/useEventStream.ts';
import type { ArtifactRecordedEvent } from './types.ts';

/**
 * Top-level layout for the demo-display SPA.
 *
 * Four regions in a 2x2 grid, mirroring plan §13:
 *
 *   +-------------------+----------------------+
 *   | Services grid     | Workflow board       |
 *   +-------------------+----------------------+
 *   | Agent transcript  | Artifact panel       |
 *   +-------------------+----------------------+
 *
 * Always-visible wallet ribbon (plan §13) will land in a follow-up
 * commit; the reducer already tracks `walletBalanceUsd` for it.
 *
 * @returns The root layout.
 */
export function App(): JSX.Element {
  const {
    services,
    transcript,
    latestArtifact,
    activePhase,
    announcedPhases,
    artifactsByPhase,
    walletBalanceUsd,
    discoveredProviderTags,
  } = useEventStream();
  const [zoomed, setZoomed] = useState<ArtifactRecordedEvent | undefined>(
    undefined,
  );
  return (
    <div className="app">
      <header className="app__header">
        <h1>Product orchestration</h1>
        <WalletRibbon balanceUsd={walletBalanceUsd} />
      </header>
      <main className="app__main">
        <div className="app__cell app__cell--top-left">
          <ServicesGrid
            services={services}
            discoveredProviderTags={discoveredProviderTags}
          />
        </div>
        <div className="app__cell app__cell--top-right">
          <WorkflowBoard
            announcedPhases={announcedPhases}
            artifactsByPhase={artifactsByPhase}
            activePhase={activePhase}
            onZoom={setZoomed}
          />
        </div>
        <div className="app__cell app__cell--bottom-left">
          <Transcript entries={transcript} />
        </div>
        <div className="app__cell app__cell--bottom-right">
          <ArtifactPanel artifact={latestArtifact} />
        </div>
      </main>
      <ArtifactZoom artifact={zoomed} onClose={() => setZoomed(undefined)} />
    </div>
  );
}
