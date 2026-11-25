import { alpha, type Theme } from '@mui/material/styles';

const LINE_HEIGHT = 19;
const ANSI_PALETTE = [
  '#4e4e4e',
  '#ff6c60',
  '#00aa00',
  '#ffffb6',
  '#96cbfe',
  '#ff73fd',
  '#00aaaa',
  '#eeeeee',
  '#7c7c7c',
  '#ff9b93',
  '#ceffab',
  '#ffffcb',
  '#b5dcfe',
  '#ff9cfe',
  '#55ffff',
  '#ffffff',
];

export const logStyles = ({ palette, typography }: Theme) => ({
  ...Object.fromEntries(
    ANSI_PALETTE.map((color, i) => [`--log-ansi-${i}`, color])
  ),
  height: '100%',
  '& .cm-editor': {
    height: '100%',
    fontSize: 13,
    backgroundColor: palette.background.default,
    color: palette.text.primary,
    '&.cm-focused': { outline: 'none' },
    '& .cm-panels': {
      border: 'none',
      backgroundColor: palette.background.paper,
      color: palette.text.primary,
    },
    '& .cm-dialog': {
      padding: '8px 40px 8px 16px',
      fontFamily: typography.fontFamily,
      '& label': { fontSize: typography.body2.fontSize },
      '& .cm-textfield': {
        width: 100,
        margin: '0 8px',
        padding: '4px 8px',
        font: 'inherit',
        color: palette.text.primary,
        backgroundColor: palette.background.default,
        border: `1px solid ${palette.divider}`,
        borderRadius: 4,
      },
      '& .cm-button': {
        padding: '4px 12px',
        font: 'inherit',
        color: palette.secondary.contrastText,
        backgroundColor: palette.secondary.main,
        backgroundImage: 'none',
        border: 'none',
        borderRadius: 4,
        cursor: 'pointer',
      },
      '& .cm-dialog-close': {
        top: 8,
        right: 12,
        color: palette.text.secondary,
        cursor: 'pointer',
      },
    },
    '& .cm-scroller': {
      fontFamily: 'Consolas, Monaco, Andale Mono, Ubuntu Mono, monospace',
      lineHeight: `${LINE_HEIGHT}px`,
      WebkitFontSmoothing: 'auto',
    },
    '& .cm-content': {
      paddingTop: '4px',
      paddingBottom: `${5 * LINE_HEIGHT}px`,
    },
    '& .cm-gutters': {
      backgroundColor: palette.background.default,
      color: palette.text.inactive,
      border: 'none',
    },
    '& .cm-lineNumbers .cm-gutterElement': {
      cursor: 'pointer',
      userSelect: 'none',
      padding: '0 16px 0 24px',
      transition: 'color 150ms',
      '&:hover': { color: palette.text.primary },
    },
    '& .cm-line:hover': { backgroundColor: palette.action.hover },
    '& .cm-line.cm-log-highlight, & .cm-gutterElement.cm-log-highlight': {
      color: palette.text.primary,
      backgroundColor: palette.action.selected,
    },
    '& .cm-searchMatch': {
      backgroundColor: alpha(palette.warning.main, 0.35),
      borderRadius: '2px',
    },
    '& .cm-searchMatch-selected': {
      backgroundColor: palette.warning.main,
      color: palette.getContrastText(palette.warning.main),
    },
  },
});
