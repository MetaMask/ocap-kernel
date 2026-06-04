import { ArtifactPanel } from './components/ArtifactPanel.tsx';
import { MarketplaceGrid } from './components/MarketplaceGrid.tsx';
import { Transcript } from './components/Transcript.tsx';
import { useEventStream } from './hooks/useEventStream.ts';

/**
 * Top-level layout for the demo-display SPA.
 *
 * V0 has three regions: marketplace grid (full-width, top), agent
 * transcript (bottom-left), artifact panel (bottom-right). The workflow
 * board and wallet ribbon land in later commits.
 *
 * @returns The root layout.
 */
export function App(): JSX.Element {
  const { services, transcript, latestArtifact } = useEventStream();
  return (
    <div className="app">
      <header className="app__header">
        <h1>Orchestration demo</h1>
      </header>
      <main className="app__main">
        <div className="app__top">
          <MarketplaceGrid services={services} />
        </div>
        <div className="app__bottom">
          <Transcript entries={transcript} />
          <ArtifactPanel artifact={latestArtifact} />
        </div>
      </main>
    </div>
  );
}
