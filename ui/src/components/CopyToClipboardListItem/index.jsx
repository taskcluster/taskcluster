import React, { useState, useEffect } from 'react';
import { node, string, object } from 'prop-types';
import { CopyToClipboard } from 'react-copy-to-clipboard';
import { makeStyles } from '@material-ui/core/styles';
import ListItem from '@material-ui/core/ListItem';
import ListItemText from '@material-ui/core/ListItemText';
import ContentCopyIcon from 'mdi-react/ContentCopyIcon';
import CheckIcon from 'mdi-react/CheckIcon';

const useStyles = makeStyles(theme => ({
  listItemButtonRoot: {
    ...theme.mixins.listItemButton,
  },
}));

function CopyToClipboardListItem(props) {
  const classes = useStyles();
  const [isCopy, setCopy] = useState(false);
  const {
    tooltipTitle,
    textToCopy,
    primary,
    secondary,
    listItemTextProps,
    listItemProps,
  } = props;

  function handleCopyClick() {
    setCopy(true);
  }

  useEffect(() => {
    if (isCopy) {
      setTimeout(() => {
        setCopy(false);
      }, 3000);
    }
  }, [isCopy]);

  return (
    <CopyToClipboard
      onCopy={handleCopyClick}
      title={`${tooltipTitle} (${isCopy ? 'Copied!' : 'Copy'})`}
      text={textToCopy}>
      <ListItem
        button
        classes={{ root: classes.listItemButtonRoot }}
        {...listItemProps}>
        <ListItemText
          primary={primary}
          secondary={secondary}
          {...listItemTextProps}
        />
        {isCopy ? <CheckIcon /> : <ContentCopyIcon />}
      </ListItem>
    </CopyToClipboard>
  );
}

CopyToClipboardListItem.propTypes = {
  // A tooltip to show when the user hovers on the list item
  tooltipTitle: string.isRequired,
  // Text to copy when a user clicks on the list item
  textToCopy: string.isRequired,
  // The ListItemText primary prop
  primary: node.isRequired,
  // The ListItemText secondary prop
  secondary: node,
  // Props applied to the ListItemText component
  listItemTextProps: object,
  // Props applied  to the ListItem component
  listItem: object,
};

CopyToClipboardListItem.defaultProps = {
  secondary: null,
  listItemTextProps: null,
  listItem: null,
};

export default CopyToClipboardListItem;
