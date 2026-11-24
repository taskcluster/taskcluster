import { type EditorState, StateEffect, StateField } from '@codemirror/state';
import {
  EditorView,
  getDialog,
  showDialog,
  ViewPlugin,
  type ViewUpdate,
} from '@codemirror/view';

type AutoScroll = 'follow' | number | null;

export const setFollow = StateEffect.define<boolean>();
export const scrollToLine = StateEffect.define<number>();

const autoScrollField = StateField.define<AutoScroll>({
  create: () => null,
  update(autoScroll, tr) {
    for (const effect of tr.effects) {
      if (effect.is(setFollow)) {
        autoScroll = effect.value ? 'follow' : null;
      } else if (effect.is(scrollToLine)) {
        autoScroll = effect.value;
      }
    }

    return tr.isUserEvent('select.search') ? null : autoScroll;
  },
});

export const isFollowing = (state: EditorState) =>
  state.field(autoScrollField) === 'follow';

const isAtBottom = ({ scrollTop, scrollHeight, clientHeight }: HTMLElement) =>
  scrollTop > Math.max(1, scrollHeight - clientHeight - 4);

// Effect for appended text, so codemirror doesn't keep the view at the bottom
// when not following.
export const keepScrollPosition = (view: EditorView) =>
  isFollowing(view.state) ? [] : [view.scrollSnapshot()];

const scrollPlugin = ViewPlugin.fromClass(
  class {
    scrollTop = 0;

    constructor(readonly view: EditorView) {
      view.scrollDOM.addEventListener('wheel', this.handleWheel, {
        passive: true,
      });
      view.scrollDOM.addEventListener('scroll', this.handleScroll, {
        passive: true,
      });
    }

    update(update: ViewUpdate) {
      const autoScroll = update.state.field(autoScrollField);

      // Reloading moves the view up, don't consider it scrolling
      if (update.state.doc.length < update.startState.doc.length) {
        this.scrollTop = 0;
      }

      // Queue the scroll for after the update, codemirror clips the
      // scroll target to the previous document while updating
      if (
        typeof autoScroll === 'number' &&
        update.state.doc.lines >= autoScroll
      ) {
        queueMicrotask(() => this.scrollToTarget(autoScroll));
      }

      if (
        autoScroll === 'follow' &&
        (update.geometryChanged || !isFollowing(update.startState))
      ) {
        update.view.requestMeasure({
          key: 'log-follow',
          read: () => null,
          write: (_, view) => {
            if (isFollowing(view.state)) {
              view.scrollDOM.scrollTop = view.scrollDOM.scrollHeight;
            }
          },
        });
      }
    }

    destroy() {
      this.view.scrollDOM.removeEventListener('wheel', this.handleWheel);
      this.view.scrollDOM.removeEventListener('scroll', this.handleScroll);
    }

    scrollToTarget(target: number) {
      const { state } = this.view;

      if (state.field(autoScrollField) === target) {
        this.view.dispatch({
          effects: [
            EditorView.scrollIntoView(state.doc.line(target).from, {
              y: 'start',
            }),
            setFollow.of(false),
          ],
        });
      }
    }

    stopAutoScroll() {
      if (this.view.state.field(autoScrollField) !== null) {
        this.view.dispatch({ effects: setFollow.of(false) });
      }
    }

    handleWheel = (event: WheelEvent) => {
      if (
        event.deltaY < 0 ||
        typeof this.view.state.field(autoScrollField) === 'number'
      ) {
        this.stopAutoScroll();
      }
    };

    handleScroll = () => {
      const { scrollDOM } = this.view;

      if (scrollDOM.scrollTop < this.scrollTop && !isAtBottom(scrollDOM)) {
        this.stopAutoScroll();
      }

      this.scrollTop = scrollDOM.scrollTop;
    };
  }
);

export const scroll = (follow: boolean) => [
  autoScrollField.init(() => (follow ? 'follow' : null)),
  scrollPlugin,
];

export const goToLine = (view: EditorView) => {
  const open = getDialog(view, 'cm-log-go-to-line');

  if (open) {
    open.dom.querySelector('input')?.select();
    return true;
  }

  const { close, result } = showDialog(view, {
    class: 'cm-log-go-to-line',
    label: 'Go to line',
    input: { type: 'number', name: 'line', min: '1', required: '' },
    submitLabel: 'Go',
    focus: true,
    top: true,
  });

  result.then(form => {
    const line = Number(form?.line.value);
    view.dispatch({
      effects: line > 0 ? [close, scrollToLine.of(line)] : close,
    });
  });

  return true;
};
