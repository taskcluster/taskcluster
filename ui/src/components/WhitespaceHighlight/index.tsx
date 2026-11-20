import { styled } from '@mui/material/styles';

const Pad = styled('span')(({ theme }) => ({
  whiteSpace: 'pre',
  backgroundColor: theme.palette.action.selected,
}));

export interface WhitespaceHighlightProps {
  /** The role ID or scope to display. */
  text: string;
}

/**
 * Show a role ID or scope with its leading and trailing whitespace made
 * visible. The whitespace stays in the text, so copying gives the exact value.
 */
export default function WhitespaceHighlight({
  text,
}: WhitespaceHighlightProps) {
  const content = text.trim();
  const start = text.indexOf(content);
  const leading = text.slice(0, start);
  const trailing = text.slice(start + content.length);

  return (
    <span>
      {leading && <Pad>{leading}</Pad>}
      {content}
      {trailing && <Pad>{trailing}</Pad>}
    </span>
  );
}
