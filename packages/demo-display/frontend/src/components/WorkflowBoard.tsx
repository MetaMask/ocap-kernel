import { UNASSIGNED_PHASE } from '../hooks/useEventStream.ts';
import type { ArtifactRecordedEvent } from '../types.ts';

type WorkflowBoardProps = {
  announcedPhases: string[];
  artifactsByPhase: Map<string, ArtifactRecordedEvent[]>;
  activePhase: string | undefined;
};

/**
 * Workflow board: one column per workflow phase the agent has
 * announced (via `phase.announced` events), in the order they were
 * announced. The dashboard intentionally carries no phase vocabulary
 * of its own — that lets a different demo run a different pipeline
 * without touching the display code.
 *
 * The column matching `activePhase` is highlighted so the audience
 * can see which beat is in flight. The `Unassigned` column appears
 * leftmost as a fallback if an artifact arrives before any phase has
 * been announced.
 *
 * @param props - Component props.
 * @param props.announcedPhases - Phases the agent has announced, in
 *   the order they were first announced.
 * @param props.artifactsByPhase - Per-phase artifact lists from the
 *   event-stream reducer.
 * @param props.activePhase - Phase the agent most recently announced
 *   (or `undefined` before the first announce).
 * @returns The rendered board.
 */
export function WorkflowBoard(props: WorkflowBoardProps): JSX.Element {
  const { announcedPhases, artifactsByPhase, activePhase } = props;
  const columns = orderedColumns(announcedPhases, artifactsByPhase);

  return (
    <section className="workflow-board">
      <header className="workflow-board__header">
        <h2>Workflow</h2>
        {activePhase === undefined ? null : (
          <span className="workflow-board__active">→ {activePhase}</span>
        )}
      </header>
      {columns.length === 0 ? (
        <div className="workflow-board__empty">
          Waiting for the agent to announce a phase…
        </div>
      ) : (
        <div className="workflow-board__columns">
          {columns.map((phase) => (
            <PhaseColumn
              key={phase}
              phase={phase}
              artifacts={artifactsByPhase.get(phase) ?? []}
              isActive={phase === activePhase}
            />
          ))}
        </div>
      )}
    </section>
  );
}

/**
 * Compute the rendered column order. Unassigned goes leftmost when
 * non-empty; announced phases follow in announce order; any phases
 * that have artifacts but were never announced (defensive — the
 * reducer routes to Unassigned in that case) are appended in their
 * insertion order.
 *
 * @param announcedPhases - Phase names the agent has announced.
 * @param artifactsByPhase - Per-phase artifact buckets.
 * @returns The phase names to render columns for, in order.
 */
function orderedColumns(
  announcedPhases: string[],
  artifactsByPhase: Map<string, ArtifactRecordedEvent[]>,
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  if ((artifactsByPhase.get(UNASSIGNED_PHASE)?.length ?? 0) > 0) {
    out.push(UNASSIGNED_PHASE);
    seen.add(UNASSIGNED_PHASE);
  }
  for (const phase of announcedPhases) {
    if (seen.has(phase)) {
      continue;
    }
    out.push(phase);
    seen.add(phase);
  }
  for (const phase of artifactsByPhase.keys()) {
    if (seen.has(phase)) {
      continue;
    }
    out.push(phase);
    seen.add(phase);
  }
  return out;
}

type PhaseColumnProps = {
  phase: string;
  artifacts: ArtifactRecordedEvent[];
  isActive: boolean;
};

/**
 * A single phase column. Shows the phase name, a count of artifacts,
 * and a vertical stack of small artifact thumbnails.
 *
 * @param props - Component props.
 * @param props.phase - Phase name (column heading).
 * @param props.artifacts - Artifacts that landed in this phase.
 * @param props.isActive - Whether this column is the active phase.
 * @returns The rendered column.
 */
function PhaseColumn({
  phase,
  artifacts,
  isActive,
}: PhaseColumnProps): JSX.Element {
  const className = `phase-column${
    isActive ? ' phase-column--active' : ''
  }${artifacts.length === 0 ? ' phase-column--empty' : ''}`;
  return (
    <div className={className}>
      <header className="phase-column__header">
        <span className="phase-column__name">{phase}</span>
        {artifacts.length === 0 ? null : (
          <span className="phase-column__count">{artifacts.length}</span>
        )}
      </header>
      <ul className="phase-column__cards">
        {artifacts.map((artifact) => (
          <ArtifactThumb key={artifact.handle} artifact={artifact} />
        ))}
      </ul>
    </div>
  );
}

type ArtifactThumbProps = {
  artifact: ArtifactRecordedEvent;
};

/**
 * Small artifact card for the workflow board. SVG artifacts get an
 * inline scaled-down preview; everything else gets a text snippet.
 *
 * @param props - Component props.
 * @param props.artifact - The artifact event to thumbnail.
 * @returns The rendered card.
 */
function ArtifactThumb({ artifact }: ArtifactThumbProps): JSX.Element {
  const title = artifact.metadata?.title ?? artifact.handle;
  return (
    <li className="phase-column__card">
      <div className="phase-column__thumb">
        {artifact.artifactKind === 'svg' ? (
          <div
            className="phase-column__thumb-svg"
            dangerouslySetInnerHTML={{ __html: artifact.data }}
          />
        ) : (
          <div className="phase-column__thumb-text">
            {artifact.artifactKind}
          </div>
        )}
      </div>
      <div className="phase-column__card-meta">
        <span className="phase-column__card-title">{title}</span>
        <span className="phase-column__card-from">
          from {artifact.fromService}
        </span>
      </div>
    </li>
  );
}
