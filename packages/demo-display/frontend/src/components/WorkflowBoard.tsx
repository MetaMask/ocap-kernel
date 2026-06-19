import { UNASSIGNED_PHASE } from '../hooks/useEventStream.ts';
import type { ArtifactRecordedEvent } from '../types.ts';

type WorkflowBoardProps = {
  announcedPhases: string[];
  artifactsByPhase: Map<string, ArtifactRecordedEvent[]>;
  activePhase: string | undefined;
  onZoom: (artifact: ArtifactRecordedEvent) => void;
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
 * Artifact cards carry a `consumes` list (set by the agent via
 * `demo_record_artifact`); when present, the card's footer shows a
 * brief "inputs: <short>, <short>" line so the audience can
 * see how each output was derived from earlier work. The short
 * form is derived from the artifact title by stripping the
 * "<product code> — " prefix so it reads as an identifier reference
 * rather than a full descriptive title. An earlier version drew
 * SVG curves between cards but the visual got messy as the board
 * filled up and didn't convey the dataflow as clearly as the
 * textual reference does.
 *
 * @param props - Component props.
 * @param props.announcedPhases - Phases the agent has announced, in
 *   the order they were first announced.
 * @param props.artifactsByPhase - Per-phase artifact lists from the
 *   event-stream reducer.
 * @param props.activePhase - Phase the agent most recently announced
 *   (or `undefined` before the first announce).
 * @param props.onZoom - Callback to open the zoom overlay for an artifact.
 * @returns The rendered board.
 */
export function WorkflowBoard(props: WorkflowBoardProps): JSX.Element {
  const { announcedPhases, artifactsByPhase, activePhase, onZoom } = props;
  const columns = orderedColumns(announcedPhases, artifactsByPhase);
  const artifactsByHandle = indexByHandle(artifactsByPhase);

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
              onZoom={onZoom}
              artifactsByHandle={artifactsByHandle}
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

/**
 * Build a flat lookup from artifact handle to its event record, so
 * the consumes-footer renderer can resolve handles to human-readable
 * titles in O(1).
 *
 * @param artifactsByPhase - Per-phase artifact buckets.
 * @returns The flat handle → artifact map.
 */
function indexByHandle(
  artifactsByPhase: Map<string, ArtifactRecordedEvent[]>,
): Map<string, ArtifactRecordedEvent> {
  const byHandle = new Map<string, ArtifactRecordedEvent>();
  for (const artifacts of artifactsByPhase.values()) {
    for (const artifact of artifacts) {
      byHandle.set(artifact.handle, artifact);
    }
  }
  return byHandle;
}

/**
 * Shorten an artifact title for use as an identifier reference in the
 * consumes footer. Services emit titles in the form
 * `<product code> — <thing>` (em-dash with surrounding spaces); we
 * strip the prefix so the footer reads as a short identifier rather
 * than a full descriptive title. If no em-dash is present the title
 * is returned unchanged.
 *
 * @param title - The source artifact's metadata title.
 * @returns The short-form label.
 */
function shortenArtifactLabel(title: string): string {
  const separator = ' — ';
  const index = title.indexOf(separator);
  if (index < 0) {
    return title;
  }
  return title.slice(index + separator.length).trim();
}

type PhaseColumnProps = {
  phase: string;
  artifacts: ArtifactRecordedEvent[];
  isActive: boolean;
  onZoom: (artifact: ArtifactRecordedEvent) => void;
  artifactsByHandle: Map<string, ArtifactRecordedEvent>;
};

/**
 * A single phase column. Shows the phase name, a count of artifacts,
 * and a vertical stack of small artifact thumbnails.
 *
 * @param props - Component props.
 * @param props.phase - Phase name (column heading).
 * @param props.artifacts - Artifacts that landed in this phase.
 * @param props.isActive - Whether this column is the active phase.
 * @param props.onZoom - Callback to open the zoom overlay for an artifact.
 * @param props.artifactsByHandle - Flat handle lookup for the
 *   consumes-footer renderer.
 * @returns The rendered column.
 */
function PhaseColumn({
  phase,
  artifacts,
  isActive,
  onZoom,
  artifactsByHandle,
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
          <ArtifactThumb
            key={artifact.handle}
            artifact={artifact}
            onZoom={onZoom}
            artifactsByHandle={artifactsByHandle}
          />
        ))}
      </ul>
    </div>
  );
}

type ArtifactThumbProps = {
  artifact: ArtifactRecordedEvent;
  onZoom: (artifact: ArtifactRecordedEvent) => void;
  artifactsByHandle: Map<string, ArtifactRecordedEvent>;
};

/**
 * Small artifact card for the workflow board. SVG artifacts get an
 * inline scaled-down preview; everything else gets a text snippet.
 * When the artifact has a `consumes` list, the footer carries a
 * second line listing each consumed artifact by its title (falling
 * back to the handle if the consumed artifact has no title or
 * hasn't been recorded yet on this client).
 *
 * @param props - Component props.
 * @param props.artifact - The artifact event to thumbnail.
 * @param props.onZoom - Callback to open the zoom overlay for this artifact.
 * @param props.artifactsByHandle - Flat handle lookup so we can
 *   resolve each consumes entry to a title.
 * @returns The rendered card.
 */
function ArtifactThumb({
  artifact,
  onZoom,
  artifactsByHandle,
}: ArtifactThumbProps): JSX.Element {
  const title = artifact.metadata?.title ?? artifact.handle;
  const consumesLabels = (artifact.consumes ?? [])
    .map((handle) => {
      const source = artifactsByHandle.get(handle);
      const sourceTitle = source?.metadata?.title;
      return sourceTitle === undefined
        ? handle
        : shortenArtifactLabel(sourceTitle);
    })
    .filter((label) => label.length > 0);
  return (
    <li
      className="phase-column__card"
      onClick={() => onZoom(artifact)}
      role="button"
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onZoom(artifact);
        }
      }}
      aria-label={`Zoom ${title}`}
    >
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
        {consumesLabels.length === 0 ? null : (
          <span className="phase-column__card-consumes">
            inputs: {consumesLabels.join(', ')}
          </span>
        )}
      </div>
    </li>
  );
}
