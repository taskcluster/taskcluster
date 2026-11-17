import { createTheme } from '@uiw/codemirror-themes';
import { foldGutter } from '@codemirror/language';
import { EditorView } from '@codemirror/view';
import { tags as t } from '@lezer/highlight';

export default [
  createTheme({
    theme: 'dark',
    settings: {
      background: '#263238',
      foreground: '#EEFFFF',
      caret: '#FFCC00',
      selection: 'rgba(128, 203, 196, 0.2)',
      gutterBackground: '#222D32',
      gutterForeground: '#546E7A',
      gutterBorder: 'transparent',
      lineHighlight: 'rgba(0, 0, 0, 0.15)',
    },
    styles: [
      { tag: t.definition(t.propertyName), color: '#F78C6C' },
      { tag: t.propertyName, color: '#C792EA' },
      { tag: t.string, color: '#C3E88D' },
      { tag: t.number, color: '#FF5370' },
      { tag: [t.bool, t.null], color: '#F78C6C' },
      { tag: [t.keyword, t.typeName], color: '#C792EA' },
      { tag: [t.separator, t.squareBracket, t.brace], color: '#FFCB6B' },
      { tag: t.meta, color: '#82AAFF' },
      { tag: t.labelName, color: '#F07178' },
      { tag: t.comment, color: '#546E7A' },
    ],
  }),
  foldGutter({
    markerDOM(open) {
      const marker = document.createElement('span');

      marker.className = open
        ? 'cm-foldMarker cm-foldMarker-open'
        : 'cm-foldMarker';
      marker.textContent = '›';
      marker.title = open ? 'Fold line' : 'Unfold line';

      return marker;
    },
  }),
  EditorView.theme(
    {
      '.cm-foldPlaceholder': {
        backgroundColor: 'rgba(0, 0, 0, 0.2)',
        border: 'none',
        padding: '0 5px',
      },
      '.cm-foldMarker': {
        display: 'inline-block',
      },
      '.cm-foldMarker-open': {
        transform: 'rotate(90deg)',
      },
      // Don't show the current line highlight when the editor isn't focused
      '&:not(.cm-focused) .cm-activeLine, &:not(.cm-focused) .cm-activeLineGutter':
        {
          backgroundColor: 'transparent',
        },
    },
    { dark: true }
  ),
];
