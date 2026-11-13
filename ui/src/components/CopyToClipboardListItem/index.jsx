import React from 'react';
import { node, string, object } from 'prop-types';
import { CopyToClipboard } from 'react-copy-to-clipboard';
import { makeStyles } from 'tss-react/mui';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import ContentCopyIcon from 'mdi-react/ContentCopyIcon';
import CheckIcon from 'mdi-react/CheckIcon';
import useCopyToClipboard from '../../utils/useCopyToClipboard';

const useStyles = makeStyles()(theme => ({
  listItemButtonRoot: {
    ...theme.mixins.listItemButton,
  },
}));

function CopyToClipboardListItem(props) {
  const { classes } = useStyles();
  const { isCopy, onCopyClick } = useCopyToClipboard();
  const {
    textToCopy,
    tooltipTitle = textToCopy,
    primary,
    secondary,
    listItemTextProps,
    listItemProps,
  } = props;

  const copyable = Boolean(textToCopy);
  const item = (
    <ListItem
      button={copyable}
      classes={copyable ? { root: classes.listItemButtonRoot } : undefined}
      {...listItemProps}>
      <ListItemText
        primary={primary}
        secondary={secondary}
        {...listItemTextProps}
      />
      {copyable && (isCopy ? <CheckIcon /> : <ContentCopyIcon />)}
    </ListItem>
  );

  if (!copyable) {
    return item;
  }

  const copyLabel = isCopy ? 'Copied!' : 'Copy';

  return (
    <CopyToClipboard
      onCopy={onCopyClick}
      title={tooltipTitle ? `${tooltipTitle} (${copyLabel})` : copyLabel}
      text={textToCopy}>
      {item}
    </CopyToClipboard>
  );
}

CopyToClipboardListItem.propTypes = {
  // A tooltip to show when the user hovers on the list item
  tooltipTitle: string,
  // Text to copy when a user clicks on the list item
  textToCopy: string,
  // The ListItemText primary prop
  primary: node.isRequired,
  // The ListItemText secondary prop
  secondary: node,
  // Props applied to the ListItemText component
  listItemTextProps: object,
  // Props applied  to the ListItem component
  listItem: object,
};

export default CopyToClipboardListItem;
