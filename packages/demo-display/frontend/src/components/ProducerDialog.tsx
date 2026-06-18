type ProducerDialogProps = {
  ttydUrl: string | null | undefined;
};

/**
 * Producer dialog pane: embeds the producer LLM's TUI as an iframe so
 * the audience can watch the conversation between the inventor and
 * the agent. The iframe URL points at a ttyd server fronting an
 * `openclaw tui --session <name>` instance running on the VPS.
 *
 * Three render states:
 *
 * - `ttydUrl === undefined` — runtime config hasn't loaded yet; show
 *   a brief "Connecting..." stub.
 * - `ttydUrl === null` — config loaded but the operator hasn't set
 *   `DEMO_DISPLAY_TTYD_URL`; show a placeholder describing how to
 *   configure it.
 * - `ttydUrl` is a string — embed the iframe.
 *
 * @param props - Component props.
 * @param props.ttydUrl - The ttyd URL from the runtime config (or
 *   `null`/`undefined` if unset).
 * @returns The rendered pane.
 */
export function ProducerDialog(props: ProducerDialogProps): JSX.Element {
  const { ttydUrl } = props;
  return (
    <section className="producer-dialog">
      <header className="producer-dialog__header">
        <h2>Producer dialog</h2>
      </header>
      <ProducerDialogBody ttydUrl={ttydUrl} />
    </section>
  );
}

type ProducerDialogBodyProps = {
  ttydUrl: string | null | undefined;
};

/**
 * Internal render branch for ProducerDialog. Split out so the header
 * stays consistent across loading / unconfigured / live states.
 *
 * @param props - Component props.
 * @param props.ttydUrl - The ttyd URL (or `null`/`undefined`).
 * @returns The rendered body.
 */
function ProducerDialogBody(props: ProducerDialogBodyProps): JSX.Element {
  const { ttydUrl } = props;
  if (ttydUrl === undefined) {
    return (
      <div className="producer-dialog__empty">Connecting to dashboard…</div>
    );
  }
  if (ttydUrl === null) {
    return (
      <div className="producer-dialog__empty">
        Producer TUI not configured. Set <code>DEMO_DISPLAY_TTYD_URL</code> on
        the demo-display server (e.g. <code>http://&lt;vps&gt;:7681</code>) and
        reload.
      </div>
    );
  }
  return (
    <iframe
      className="producer-dialog__frame"
      src={ttydUrl}
      title="Producer TUI"
    />
  );
}
