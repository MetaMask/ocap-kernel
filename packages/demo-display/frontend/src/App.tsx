import { MarketplaceGrid } from './components/MarketplaceGrid.tsx';
import { useEventStream } from './hooks/useEventStream.ts';

/**
 * Top-level layout for the demo-display SPA.
 *
 * V0 has a single region (marketplace grid). Subsequent commits add
 * the transcript panel, artifact panel, and workflow board.
 *
 * @returns The root layout.
 */
export function App(): JSX.Element {
  const services = useEventStream();
  return (
    <div className="app">
      <header className="app__header">
        <h1>Orchestration demo</h1>
      </header>
      <main className="app__main">
        <MarketplaceGrid services={services} />
      </main>
    </div>
  );
}
