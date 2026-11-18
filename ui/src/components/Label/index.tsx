import { purple } from '@mui/material/colors';
import { styled, type Theme } from '@mui/material/styles';

export type LabelStatus =
  | 'error'
  | 'success'
  | 'warning'
  | 'default'
  | 'info'
  | 'pending';

export interface LabelProps {
  /** An intent-driven color indicator. */
  status: LabelStatus;
}

const statusColors = (theme: Theme, status: LabelStatus) => {
  const { palette } = theme;

  switch (status) {
    case 'error':
    case 'success':
    case 'warning':
    case 'info':
      return {
        backgroundColor: palette[status].dark,
        color: palette[status].contrastText,
      };
    case 'default':
      return {
        backgroundColor: palette.grey[700],
        color: palette.getContrastText(palette.grey[700]),
      };
    case 'pending':
      return {
        backgroundColor: purple[400],
        color: palette.getContrastText(purple[400]),
      };
  }
};

/**
 * A label color-coded based on a given status.
 */
const Label = styled('span', {
  shouldForwardProp: prop => prop !== 'status',
})<LabelProps>(({ theme, status }) => ({
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  verticalAlign: 'middle',
  minWidth: 36,
  padding: '3px 8px 2px',
  borderRadius: theme.shape.borderRadius,
  fontWeight: theme.typography.button.fontWeight,
  fontSize: '0.7em',
  lineHeight: 1.75,
  letterSpacing: 'normal',
  textAlign: 'center',
  textTransform: 'uppercase',
  userSelect: 'none',
  ...statusColors(theme, status),
}));

export default Label;
