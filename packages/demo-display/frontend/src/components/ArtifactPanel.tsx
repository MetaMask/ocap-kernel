import { marked } from 'marked';

import type { ArtifactRecordedEvent } from '../types.ts';

type ArtifactPanelProps = {
  artifact: ArtifactRecordedEvent | undefined;
};

/**
 * Render the most recently produced artifact at full size. Rendering
 * dispatches on `artifactKind`:
 *
 *   - `svg` — embedded inline via `dangerouslySetInnerHTML`. The SVG
 *     payload originates from a service vat running under SES
 *     lockdown, so we trust the source for V0; the production demo
 *     might want to sandbox via `<iframe srcdoc=…>` instead.
 *   - `image` — rendered through `<img>` with the payload as the
 *     `src` (typically a data URI).
 *   - `markdown`, `json`, anything else — preformatted text in a
 *     `<pre>`. Markdown formatting will come in a later commit when
 *     react-markdown becomes worth the dep cost.
 *
 * @param props - Component props.
 * @param props.artifact - The most recent artifact event, or
 *   `undefined` if none has been recorded yet.
 * @returns The rendered panel.
 */
export function ArtifactPanel(props: ArtifactPanelProps): JSX.Element {
  const { artifact } = props;
  return (
    <section className="artifact-panel">
      <header className="artifact-panel__header">
        <h2>Latest artifact</h2>
        {artifact?.metadata?.title === undefined ? null : (
          <span className="artifact-panel__title">
            {artifact.metadata.title}
          </span>
        )}
      </header>
      {artifact === undefined ? (
        <div className="artifact-panel__empty">
          No artifacts yet — the agent will record one soon.
        </div>
      ) : (
        <>
          <ArtifactBody artifact={artifact} />
          <footer className="artifact-panel__footer">
            <span className="artifact-panel__handle">{artifact.handle}</span>
            <span className="artifact-panel__from">
              from {artifact.fromService}
            </span>
          </footer>
        </>
      )}
    </section>
  );
}

type ArtifactBodyProps = {
  artifact: ArtifactRecordedEvent;
};

/**
 * Dispatch the artifact payload to the renderer matching its kind.
 * Exported so the zoom modal can reuse the same rendering surface.
 *
 * @param props - Component props.
 * @param props.artifact - The artifact event to render.
 * @returns The rendered body.
 */
export function ArtifactBody({ artifact }: ArtifactBodyProps): JSX.Element {
  if (artifact.artifactKind === 'svg') {
    return (
      <div
        className="artifact-panel__body artifact-panel__body--svg"
        dangerouslySetInnerHTML={{ __html: artifact.data }}
      />
    );
  }
  if (artifact.artifactKind === 'image') {
    return (
      <div className="artifact-panel__body artifact-panel__body--image">
        <img
          src={artifact.data}
          alt={artifact.metadata?.title ?? artifact.handle}
        />
      </div>
    );
  }
  if (artifact.artifactKind === 'markdown') {
    // `marked.parse` is synchronous when given a string; the type
    // signature returns `string | Promise<string>` because async
    // extensions are supported, but we don't use any.
    const html = marked.parse(artifact.data, { async: false });
    return (
      <div
        className="artifact-panel__body artifact-panel__body--markdown"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    );
  }
  return (
    <pre className="artifact-panel__body artifact-panel__body--text">
      {artifact.data}
    </pre>
  );
}
