import { ArtifactPanel } from './components/ArtifactPanel.tsx';
import { MarketplaceGrid } from './components/MarketplaceGrid.tsx';
import { Transcript } from './components/Transcript.tsx';
import { WalletRibbon } from './components/WalletRibbon.tsx';
import { WorkflowBoard } from './components/WorkflowBoard.tsx';
import { useEventStream } from './hooks/useEventStream.ts';

/**
 * Top-level layout for the demo-display SPA.
 *
 * Four regions in a 2x2 grid, mirroring plan §13:
 *
 *   +-------------------+----------------------+
 *   | Marketplace grid  | Workflow board       |
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
  } = useEventStream();
  return (
    <div className="app">
      <header className="app__header">
        <h1>Orchestration demo</h1>
        <WalletRibbon balanceUsd={walletBalanceUsd} />
      </header>
      <main className="app__main">
        <div className="app__cell app__cell--top-left">
          <MarketplaceGrid services={services} />
        </div>
        <div className="app__cell app__cell--top-right">
          <WorkflowBoard
            announcedPhases={announcedPhases}
            artifactsByPhase={artifactsByPhase}
            activePhase={activePhase}
          />
        </div>
        <div className="app__cell app__cell--bottom-left">
          <Transcript entries={transcript} />
        </div>
        <div className="app__cell app__cell--bottom-right">
          <ArtifactPanel artifact={latestArtifact} />
        </div>
      </main>
    </div>
  );
}
