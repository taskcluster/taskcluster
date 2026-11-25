import React from 'react';
import { node, string, object } from 'prop-types';
import { makeStyles } from 'tss-react/mui';
import ListItem from '@mui/material/ListItem';
import ListItemButton from '@mui/material/ListItemButton';
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
  const { isCopy, copy } = useCopyToClipboard();
  const {
    textToCopy,
    tooltipTitle = textToCopy,
    primary,
    secondary,
    listItemTextProps,
    listItemProps,
  } = props;

  const copyable = Boolean(textToCopy);
  const copyLabel = isCopy ? 'Copied!' : 'Copy';
  const Item = copyable ? ListItemButton : ListItem;

  return (
    <Item
      classes={copyable ? { root: classes.listItemButtonRoot } : undefined}
      {...(copyable && {
        title: tooltipTitle ? `${tooltipTitle} (${copyLabel})` : copyLabel,
        onClick: () => copy(textToCopy),
      })}
      {...listItemProps}>
      <ListItemText
        primary={primary}
        secondary={secondary}
        {...listItemTextProps}
      />
      {copyable && (isCopy ? <CheckIcon /> : <ContentCopyIcon />)}
    </Item>
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
