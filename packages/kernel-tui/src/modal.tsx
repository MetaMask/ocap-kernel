import {
  connectModalStream,
  getStreamSocketPath,
} from '@metamask/kernel-node-runtime/daemon';
import type {
  Decision,
  SectionNotification,
} from '@metamask/kernel-utils/session';
import type { NodeSocketDuplexStream } from '@metamask/streams';
import {
  Box,
  Text,
  render as inkRender,
  useApp,
  useInput,
  useStdout,
} from 'ink';
import React, { useEffect, useRef, useState } from 'react';

type PendingDecision = SectionNotification & {
  selected: 0 | 1;
  feedbackMode: boolean;
  feedback: string;
};

/**
 * Return a new pending list with the first entry patched.
 *
 * @param prev - Current pending decisions.
 * @param patch - Fields to merge into the head.
 * @returns Updated list.
 */
function updateHead(
  prev: PendingDecision[],
  patch: Partial<PendingDecision>,
): PendingDecision[] {
  const [head, ...rest] = prev;
  if (head === undefined) {
    return prev;
  }
  return [{ ...head, ...patch }, ...rest];
}

type ModalAppProps = {
  channelUrl: string;
  streamSocketPath: string;
  onFatalError: (message: string) => void;
};

/**
 * Ink component that renders the modal TUI.
 *
 * @param props - Component props.
 * @param props.channelUrl - The OCAP URL of the channel to subscribe to.
 * @param props.streamSocketPath - The stream socket path.
 * @param props.onFatalError - Callback invoked with an error message on fatal stream errors.
 * @returns The rendered component.
 */
function ModalApp({
  channelUrl,
  streamSocketPath,
  onFatalError,
}: ModalAppProps): React.JSX.Element {
  const { exit } = useApp();
  const { stdout } = useStdout();
  const [pending, setPending] = useState<PendingDecision[]>([]);
  const [error, setError] = useState<string | undefined>();
  const streamRef = useRef<NodeSocketDuplexStream<
    SectionNotification,
    Decision
  > | null>(null);

  useEffect(() => {
    let active = true;

    const run = async (): Promise<void> => {
      let stream: NodeSocketDuplexStream<SectionNotification, Decision>;
      try {
        stream = await connectModalStream(streamSocketPath, channelUrl);
      } catch (connectError) {
        if (active) {
          onFatalError(String(connectError));
          exit();
        }
        return;
      }

      if (!active) {
        await stream.return();
        return;
      }

      streamRef.current = stream;

      try {
        for await (const notification of stream) {
          if (!active) {
            break;
          }
          setPending((prev) => [
            ...prev,
            {
              ...notification,
              selected: 0,
              feedbackMode: false,
              feedback: '',
            },
          ]);
        }
      } catch (streamError) {
        if (active) {
          onFatalError(String(streamError));
          exit();
        }
      }
    };

    run().catch(() => undefined);

    return () => {
      active = false;
      streamRef.current?.return().catch(() => undefined);
    };
  }, [channelUrl, streamSocketPath, exit]);

  const submit = (dec: PendingDecision): void => {
    const verdict: Decision['verdict'] =
      dec.selected === 0 ? 'accept' : 'reject';
    const decision: Decision = {
      token: dec.token,
      verdict,
      feedback: dec.feedback,
    };
    setPending((prev) => prev.filter((item) => item.token !== dec.token));
    streamRef.current?.write(decision).catch((submitError: unknown) => {
      setError(String(submitError));
    });
  };

  useInput((input, key) => {
    const head = pending[0];
    if (head === undefined) {
      return;
    }

    if (!head.feedbackMode) {
      if (key.upArrow) {
        setPending((prev) => updateHead(prev, { selected: 0 }));
      } else if (key.downArrow) {
        setPending((prev) => updateHead(prev, { selected: 1 }));
      } else if (input === '1') {
        if (head.feedback) {
          setPending((prev) => updateHead(prev, { selected: 0 }));
        } else {
          submit({ ...head, selected: 0 });
        }
      } else if (input === '2') {
        if (head.feedback) {
          setPending((prev) => updateHead(prev, { selected: 1 }));
        } else {
          submit({ ...head, selected: 1 });
        }
      } else if (key.tab) {
        setPending((prev) => updateHead(prev, { feedbackMode: true }));
      } else if (key.return) {
        submit(head);
      }
    } else if (key.escape) {
      setPending((prev) =>
        updateHead(prev, { feedbackMode: false, feedback: '' }),
      );
    } else if (key.tab) {
      setPending((prev) => updateHead(prev, { feedbackMode: false }));
    } else if (key.return) {
      submit(head);
    } else if (key.backspace || key.delete) {
      setPending((prev) =>
        updateHead(prev, { feedback: head.feedback.slice(0, -1) }),
      );
    } else if (!key.ctrl && !key.meta && /^[\x20-\x7e]+$/u.test(input)) {
      setPending((prev) =>
        updateHead(prev, { feedback: head.feedback + input }),
      );
    }
  });

  const head = pending[0];

  const acceptLabel =
    head?.selected === 0 && head.feedbackMode
      ? `Accept${head.feedback ? `, ${head.feedback}` : ''}`
      : 'Accept';
  const rejectLabel =
    head?.selected === 1 && head.feedbackMode
      ? `Reject${head.feedback ? `, ${head.feedback}` : ''}`
      : 'Reject';

  const hint = head?.feedbackMode
    ? 'Esc to cancel · Tab to finish note · Enter to submit'
    : 'Esc to cancel · Tab to add note';

  const pendingCount = pending.length;
  const termHeight = stdout.rows ?? 24;

  return (
    <Box flexDirection="column" height={termHeight} paddingX={1}>
      <Box marginBottom={1}>
        <Text bold color="cyan">
          Authorization Request
        </Text>
        {pendingCount > 0 && (
          <Text dimColor>
            {'  '}
            {String(pendingCount)} pending
          </Text>
        )}
      </Box>

      {head === undefined ? (
        <Text dimColor>No requests.</Text>
      ) : (
        <>
          <Box marginBottom={1} paddingX={1}>
            <Text dimColor>{head.description}</Text>
          </Box>

          <Box marginBottom={1}>
            <Text>Do you want to proceed?</Text>
          </Box>

          <Box flexDirection="column" marginBottom={1}>
            {head.selected === 0 ? (
              <Text color="cyan">{`> 1. ${acceptLabel}`}</Text>
            ) : (
              <Text>{`  1. ${acceptLabel}`}</Text>
            )}
            {head.selected === 1 ? (
              <Text color="cyan">{`> 2. ${rejectLabel}`}</Text>
            ) : (
              <Text>{`  2. ${rejectLabel}`}</Text>
            )}
          </Box>
        </>
      )}

      {error !== undefined && (
        <Box>
          <Text color="red">Error: {error}</Text>
        </Box>
      )}

      <Box flexGrow={1} />

      <Text dimColor>{head === undefined ? 'Ctrl+C to exit' : hint}</Text>
    </Box>
  );
}

/**
 * Run the interactive modal TUI connected to the given channel OCAP URL.
 *
 * @param channelUrl - The OCAP URL of the channel to subscribe to.
 */
export async function runModal(channelUrl: string): Promise<void> {
  const streamSocketPath = getStreamSocketPath();
  let fatalError: string | undefined;

  process.stdout.write('\x1b[?1049h'); // enter alternate screen buffer
  process.stdout.write('\x1b[?25l'); // hide cursor

  const { waitUntilExit } = inkRender(
    <ModalApp
      channelUrl={channelUrl}
      streamSocketPath={streamSocketPath}
      onFatalError={(message) => {
        fatalError = message;
      }}
    />,
  );

  await waitUntilExit();

  process.stdout.write('\x1b[?25h'); // restore cursor
  process.stdout.write('\x1b[?1049l'); // exit alternate screen buffer

  if (fatalError !== undefined) {
    process.stderr.write(`Error: ${fatalError}\n`);
    // eslint-disable-next-line n/no-process-exit -- force-exit to close dangling stream socket
    process.exit(1);
  }
  // eslint-disable-next-line n/no-process-exit -- force-exit to close dangling stream socket
  process.exit(0);
}
