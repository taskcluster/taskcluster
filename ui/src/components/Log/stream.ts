import type { EditorView } from '@codemirror/view';
import { AnsiParser, addColors } from './ansi';
import { keepScrollPosition } from './scroll';

export class LogLoadError extends Error {
  name = 'LogLoadError';

  constructor(
    message: string,
    readonly status?: number
  ) {
    super(message);
  }
}

const completeLinesEnd = (text: string) => {
  const complete = text.endsWith('\r') ? text.slice(0, -1) : text;

  return Math.max(complete.lastIndexOf('\n'), complete.lastIndexOf('\r')) + 1;
};

export const streamLog = async (
  view: EditorView,
  url: string,
  signal: AbortSignal
) => {
  const parser = new AnsiParser();
  let pending = '';
  let started = false;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const flush = (final: boolean) => {
    const end = final ? pending.length : completeLinesEnd(pending);
    const lines = pending.slice(0, end).replace(/\r\n?/g, '\n');

    clearTimeout(timeout);
    timeout = undefined;
    pending = pending.slice(end);

    if (!end) {
      return;
    }

    // Lines are joined with a \n before them, so the log doesn't end with an
    // empty line
    const from = view.state.doc.length;
    const { text, ranges } = parser.push(
      (started ? '\n' : '') + lines.replace(/\n$/, ''),
      from
    );

    started = true;
    view.dispatch({
      changes: { from, insert: text },
      effects: [addColors.of(ranges), ...keepScrollPosition(view)],
    });
  };

  signal.addEventListener('abort', () => clearTimeout(timeout));

  try {
    const response = await fetch(url, { signal });

    if (!response.ok) {
      throw new LogLoadError(
        `${response.statusText || 'Request failed'} (HTTP ${response.status})`,
        response.status
      );
    }

    const reader = response.body
      ?.pipeThrough(new TextDecoderStream())
      .getReader();

    while (reader) {
      const { value, done } = await reader.read();

      if (signal.aborted) {
        return;
      }

      if (done) {
        break;
      }

      pending += value;
      // Not requestAnimationFrame. Codemirror's measure would then run a frame
      // later, painting the new lines before following scrolls to them
      timeout ??= setTimeout(() => flush(false));
    }
  } finally {
    if (!signal.aborted) {
      flush(true);
    }
  }
};
