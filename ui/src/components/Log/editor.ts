import { openSearchPanel } from '@codemirror/search';
import {
  EditorState,
  RangeSet,
  StateEffect,
  StateField,
  type Text,
} from '@codemirror/state';
import {
  Decoration,
  type DecorationSet,
  EditorView,
  GutterMarker,
  gutterLineClass,
  keymap,
  lineNumbers,
} from '@codemirror/view';
import { ansiColors } from './ansi';
import { isFollowing, scroll, scrollToLine, setFollow } from './scroll';
import { filterField, matchesField, search } from './search';

export interface LineRange {
  start: number;
  end: number;
}

export interface LogStatus {
  follow: boolean;
  filter: boolean;
  matches: number;
  empty: boolean;
}

const setHighlight = StateEffect.define<LineRange | null>();

export const highlightField = StateField.define<LineRange | null>({
  create: () => null,
  update: (range, tr) =>
    tr.effects.reduce(
      (range, effect) => (effect.is(setHighlight) ? effect.value : range),
      range
    ),
});

const clickHighlight = (
  current: LineRange | null,
  line: number,
  extend: boolean
): LineRange | null => {
  if (current?.start === line) {
    return null;
  }

  if (!extend || !current) {
    return { start: line, end: line };
  }

  return line > current.start
    ? { start: current.start, end: line }
    : { start: line, end: current.end };
};

const lineDecoration = Decoration.line({ class: 'cm-log-highlight' });
const gutterMarker = new (class extends GutterMarker {
  elementClass = 'cm-log-highlight';
})();

const lastHighlightedLine = (range: LineRange | null, doc: Text) =>
  range ? Math.min(range.end, doc.lines) : 0;

const highlightLines = (doc: Text, from: number, to: number) => {
  const lines = [];
  const markers = [];

  for (let n = from; n <= to; n++) {
    const pos = doc.line(n).from;

    lines.push(lineDecoration.range(pos));
    markers.push(gutterMarker.range(pos));
  }

  return { lines, markers };
};

interface HighlightDecorations {
  lines: DecorationSet;
  markers: RangeSet<GutterMarker>;
}

const highlightDecorations = StateField.define<HighlightDecorations>({
  create: () => ({ lines: Decoration.none, markers: RangeSet.empty }),
  update(decorations, tr) {
    const range = tr.state.field(highlightField);
    const last = lastHighlightedLine(range, tr.newDoc);

    if (
      range !== tr.startState.field(highlightField) ||
      tr.newDoc.length < tr.startState.doc.length
    ) {
      const { lines, markers } = range
        ? highlightLines(tr.newDoc, range.start, last)
        : { lines: [], markers: [] };

      return { lines: Decoration.set(lines), markers: RangeSet.of(markers) };
    }

    if (!range || !tr.docChanged) {
      return decorations;
    }

    const previous = lastHighlightedLine(range, tr.startState.doc);
    const added = highlightLines(
      tr.newDoc,
      Math.max(range.start, previous + 1),
      last
    );

    return {
      lines: decorations.lines.map(tr.changes).update({ add: added.lines }),
      markers: decorations.markers
        .map(tr.changes)
        .update({ add: added.markers }),
    };
  },
  provide: field => [
    EditorView.decorations.from(field, ({ lines }) => lines),
    gutterLineClass.from(field, ({ markers }) => markers),
  ],
});

const highlight = [highlightField, highlightDecorations];

export const selectLines = (range: LineRange | null) =>
  range
    ? [setHighlight.of(range), scrollToLine.of(range.start)]
    : [setHighlight.of(null)];

const logStatus = (state: EditorState): LogStatus => ({
  follow: isFollowing(state),
  filter: state.field(filterField),
  matches: state.field(matchesField).length,
  empty: state.doc.length === 0,
});

interface LogEditorOptions {
  parent: HTMLElement;
  follow: boolean;
  highlight: LineRange | null;
  onStatus: (status: LogStatus) => void;
  onHighlight: (range: LineRange | null) => void;
  onFocusSearch: () => void;
}

export const createLogEditor = (options: LogEditorOptions) => {
  let status: LogStatus | null = null;
  const reportStatus = (state: EditorState) => {
    const next = logStatus(state);

    if (
      status?.follow !== next.follow ||
      status.filter !== next.filter ||
      status.matches !== next.matches ||
      status.empty !== next.empty
    ) {
      status = next;
      options.onStatus(next);
    }
  };

  const view = new EditorView({
    parent: options.parent,
    state: EditorState.create({
      extensions: [
        EditorState.readOnly.of(true),
        EditorView.editable.of(false),
        EditorView.contentAttributes.of({ tabindex: '0' }),
        EditorState.tabSize.of(8),
        lineNumbers({
          domEventHandlers: {
            mousedown: (view, block, event) => {
              const { state } = view;
              const line = state.doc.lineAt(block.from).number;
              const range = clickHighlight(
                state.field(highlightField),
                line,
                (event as MouseEvent).shiftKey
              );

              view.dispatch({
                effects: [
                  setHighlight.of(range),
                  state.field(filterField)
                    ? scrollToLine.of(line)
                    : setFollow.of(false),
                ],
              });
              options.onHighlight(range);

              return true;
            },
          },
        }),
        highlight,
        scroll(options.follow),
        search,
        ansiColors,
        keymap.of([
          {
            key: 'Mod-f',
            run: () => {
              options.onFocusSearch();
              return true;
            },
          },
          {
            key: 'Mod-a',
            run: view => {
              if (!view.hasFocus) {
                return false;
              }

              view.dispatch({
                selection: { anchor: 0, head: view.state.doc.length },
                userEvent: 'select',
              });
              return true;
            },
          },
        ]),
        EditorView.updateListener.of(update => reportStatus(update.state)),
      ],
    }),
  });

  openSearchPanel(view);
  view.dispatch({ effects: selectLines(options.highlight) });
  reportStatus(view.state);
  view.focus();

  return view;
};
