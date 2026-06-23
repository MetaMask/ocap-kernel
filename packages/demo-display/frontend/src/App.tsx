import { useState } from 'react';

import { ArtifactZoom } from './components/ArtifactZoom.tsx';
import { Events } from './components/Events.tsx';
import { ProducerDialog } from './components/ProducerDialog.tsx';
import { ServicesGrid } from './components/ServicesGrid.tsx';
import { WalletRibbon } from './components/WalletRibbon.tsx';
import { WorkflowBoard } from './components/WorkflowBoard.tsx';
import { useConfig } from './hooks/useConfig.ts';
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
 *   | Events log        | Producer dialog      |
 *   +-------------------+----------------------+
 *
 * The bottom-right cell embeds the producer LLM's TUI as an iframe
 * (via ttyd), so the audience can watch the conversation between the
 * inventor and the agent directly — replacing the previous Latest
 * Artifact pane, which was redundant with the workflow board's
 * zoom-on-click. Individual artifacts are still viewable full-size
 * via the zoom overlay.
 *
 * @returns The root layout.
 */
export function App(): JSX.Element {
  const {
    services,
    events,
    activePhase,
    announcedPhases,
    artifactsByPhase,
    walletBalanceUsd,
    discoveredProviderTags,
  } = useEventStream();
  const config = useConfig();
  const [zoomed, setZoomed] = useState<ArtifactRecordedEvent | undefined>(
    undefined,
  );
  return (
    <div className="app">
      <header className="app__header">
        <h1>Service Orchestration</h1>
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
          <Events entries={events} />
        </div>
        <div className="app__cell app__cell--bottom-right">
          <ProducerDialog ttydUrl={config?.ttydUrl} />
        </div>
      </main>
      <ArtifactZoom artifact={zoomed} onClose={() => setZoomed(undefined)} />
    </div>
  );
}
