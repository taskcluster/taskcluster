import {
  getSearchQuery,
  SearchQuery,
  search as searchExtension,
  setSearchQuery,
} from '@codemirror/search';
import {
  RangeSetBuilder,
  StateEffect,
  StateField,
  type Text,
  type Transaction,
} from '@codemirror/state';
import { Decoration, EditorView } from '@codemirror/view';
import { scrollToLine, setFollow } from './scroll';

export const setQuery = (view: EditorView, text: string) => {
  const query = new SearchQuery({
    search: text.replace(/[\\^$.*+?()[\]{}|]/g, '\\$&'),
    regexp: true, // This is orders of magnitude faster than a literal search
  });

  if (!query.eq(getSearchQuery(view.state))) {
    view.dispatch({
      selection: {
        anchor: view.lineBlockAtHeight(view.scrollDOM.scrollTop).from,
      },
      effects: setSearchQuery.of(query),
    });
  }
};

const transactionQuery = (tr: Transaction) =>
  tr.effects.reduce(
    (query, effect) => (effect.is(setSearchQuery) ? effect.value : query),
    getSearchQuery(tr.startState)
  );

const findMatches = (query: SearchQuery, doc: Text, from: number) => {
  const cursor = query.getCursor(doc, from);
  const matches = [];

  for (let match = cursor.next(); !match.done; match = cursor.next()) {
    matches.push(match.value.from);
  }

  return matches;
};

const noMatches: readonly number[] = [];

export const matchesField = StateField.define<readonly number[]>({
  create: () => noMatches,
  update(matches, tr) {
    const query = transactionQuery(tr);
    const { length } = tr.startState.doc;
    if (!query.valid) {
      return noMatches;
    }

    if (query !== getSearchQuery(tr.startState) || tr.newDoc.length < length) {
      return findMatches(query, tr.newDoc, 0);
    }

    if (!tr.docChanged) {
      return matches;
    }

    const added = findMatches(query, tr.newDoc, length);
    return added.length ? matches.concat(added) : matches;
  },
});

export const setFilter = StateEffect.define<boolean>();
export const filterField = StateField.define<boolean>({
  create: () => false,
  update(filter, tr) {
    for (const effect of tr.effects) {
      if (effect.is(setFilter)) {
        filter = effect.value;
      } else if (
        effect.is(scrollToLine) ||
        (effect.is(setFollow) && effect.value)
      ) {
        filter = false;
      }
    }

    return filter && transactionQuery(tr).valid;
  },
});

const hide = Decoration.replace({ block: true });

const hideLinesWithout = (doc: Text, matches: readonly number[]) => {
  const builder = new RangeSetBuilder<Decoration>();
  let next = 1;
  const hideUpTo = (last: number) => {
    if (last >= next) {
      builder.add(doc.line(next).from, doc.line(last).to, hide);
    }
  };

  for (const pos of matches) {
    const line = doc.lineAt(pos).number;

    if (line >= next) {
      hideUpTo(line - 1);
      next = line + 1;
    }
  }

  hideUpTo(doc.lines);

  return builder.finish();
};

// Codemirror only highlights matches while its search panel is open so make sure we keep it open
// The panel must also stay in the layout, codemirror uses it for scroll margins...
export const search = [
  searchExtension({
    top: true,
    createPanel: () => ({ dom: document.createElement('div') }),
    scrollToMatch: range => EditorView.scrollIntoView(range, { y: 'center' }),
  }),
  matchesField,
  filterField,
  EditorView.decorations.compute(['doc', filterField, matchesField], state =>
    state.field(filterField)
      ? hideLinesWithout(state.doc, state.field(matchesField))
      : Decoration.none
  ),
];
