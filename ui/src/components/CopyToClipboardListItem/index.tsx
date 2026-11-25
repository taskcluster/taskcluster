import type { ReactNode } from 'react';
import ListItem from '@mui/material/ListItem';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemText, {
  type ListItemTextProps,
} from '@mui/material/ListItemText';
import ContentCopyIcon from 'mdi-react/ContentCopyIcon';
import CheckIcon from 'mdi-react/CheckIcon';
import useCopyToClipboard from '../../utils/useCopyToClipboard';

export interface CopyToClipboardListItemProps {
  textToCopy?: string | null;
  tooltipTitle?: string | null;
  primary: ReactNode;
  secondary?: ReactNode;
  listItemTextProps?: ListItemTextProps;
}

export default function CopyToClipboardListItem({
  textToCopy,
  tooltipTitle = textToCopy,
  primary,
  secondary,
  listItemTextProps,
}: CopyToClipboardListItemProps) {
  const { isCopy, copy } = useCopyToClipboard();
  const text = (
    <ListItemText
      primary={primary}
      secondary={secondary}
      {...listItemTextProps}
    />
  );

  if (!textToCopy) {
    return <ListItem>{text}</ListItem>;
  }

  const copyLabel = isCopy ? 'Copied!' : 'Copy';

  return (
    <ListItemButton
      sx={theme => theme.mixins.listItemButton}
      title={tooltipTitle ? `${tooltipTitle} (${copyLabel})` : copyLabel}
      onClick={() => copy(textToCopy)}>
      {text}
      {isCopy ? <CheckIcon /> : <ContentCopyIcon />}
    </ListItemButton>
  );
}
