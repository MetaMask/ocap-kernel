import { UNASSIGNED_PHASE } from '../hooks/useEventStream.ts';
import type { ArtifactRecordedEvent } from '../types.ts';

/**
 * Canonical phase order for the workflow board. Electronics (hardware)
 * and Firmware (embedded software) are distinct phases so the
 * audience sees each acknowledged. Phases the agent announces that
 * aren't in this list are appended at the end so nothing is dropped.
 */
const CANONICAL_PHASES = [
  'Concept',
  'Electronics',
  'Firmware',
  'Procurement',
  'Finance',
  'Tooling',
  'Manufacturing',
  'Packaging',
  'Distribution',
  'Sales',
] as const;

type WorkflowBoardProps = {
  artifactsByPhase: Map<string, ArtifactRecordedEvent[]>;
  activePhase: string | undefined;
};

/**
 * Workflow board: one column per workflow phase, populated by
 * artifacts the agent recorded while that phase was active. The
 * column matching `activePhase` gets a visual highlight so the
 * audience can see which beat of the arc is currently in flight.
 *
 * @param props - Component props.
 * @param props.artifactsByPhase - Per-phase artifact lists from the
 *   event-stream reducer.
 * @param props.activePhase - Phase the agent most recently announced
 *   (or `undefined` before the first announce).
 * @returns The rendered board.
 */
export function WorkflowBoard(props: WorkflowBoardProps): JSX.Element {
  const { artifactsByPhase, activePhase } = props;
  const columns = orderedColumns(artifactsByPhase);

  return (
    <section className="workflow-board">
      <header className="workflow-board__header">
        <h2>Workflow</h2>
        {activePhase === undefined ? null : (
          <span className="workflow-board__active">→ {activePhase}</span>
        )}
      </header>
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
    </section>
  );
}

/**
 * Compute the rendered column order: canonical phases first (always
 * shown so the audience reads the arc left-to-right), then any
 * additional phases the agent announced that weren't in the canonical
 * list, then the Unassigned bucket if it has anything in it.
 *
 * @param artifactsByPhase - Per-phase artifact buckets.
 * @returns The phase names to render columns for, in order.
 */
function orderedColumns(
  artifactsByPhase: Map<string, ArtifactRecordedEvent[]>,
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const phase of CANONICAL_PHASES) {
    out.push(phase);
    seen.add(phase);
  }
  for (const phase of artifactsByPhase.keys()) {
    if (phase === UNASSIGNED_PHASE || seen.has(phase)) {
      continue;
    }
    out.push(phase);
    seen.add(phase);
  }
  if ((artifactsByPhase.get(UNASSIGNED_PHASE)?.length ?? 0) > 0) {
    out.unshift(UNASSIGNED_PHASE);
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
